const app = require('express')();
const bodyParser = require('body-parser');
const http = require('http').Server(app);
const sio = require('socket.io')(http);
const mongo = require('mongodb');
const mongoClient = mongo.MongoClient;
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3000;
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_URL = `mongodb://${MONGO_HOST}:27017/pchat`;

var mongodb = null;

const jsonParser = bodyParser.json();

// Initialize DB
mongoClient.connect(MONGO_URL, { useNewUrlParser: true }, (err, db) => {
  if (err) throw err;
  mongodb = db.db();

  // HTTP paths go here
  app.use(jsonParser);

  app.get('/', (_, res) => {
    res.redirect('/pchat');
  });

  app.get('/pchat', (_, res) => {
    res.sendFile('dist/index.html', {
      'root': __dirname,
    });
  });

  app.get('/port', (_, res) => {
    res.send(PORT.toString());
  });

  function requireAuth(req, res, next) {
    const { userId } = req.body;
    if (userId == null) {
      res.status(400);
      res.send('userId must be specified.');
    } else {
      mongodb.collection('user').findOne({ _id: new mongo.ObjectID(userId) }, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('Database error');
        } else {
          if (result == null) {
            res.status(401);
            res.send('Unauthorized');
          } else {
            req['userData'] = result;
            next();
          }
        }
      });
    }
  }

  app.post('/api/register', (req, res) => {
    const { login, name, password } = req.body;
    if (login == null || name == null || password == null) {
      res.status(400);
      res.send('Specify { login, name, password }');
    } else {
      mongodb.collection('user').findOne({ login: req.body['login'] }, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('database error');
        } else {
          if (result == null) {
            // User does not exist
            bcrypt.genSalt(3, (_, salt) => {
              bcrypt.hash(req.body['password'], salt, (_, encryptedPassword) => {
                const user = {
                  login: req.body['login'],
                  name: req.body['name'],
                  password: encryptedPassword,
                  groups: [],
                };
                mongodb.collection('user')
                  .insertOne(
                    user,
                    (err, result) => {
                      if (err) {
                        console.log(err);
                        res.status(500);
                        res.send('Database error');
                      } else {
                        res.status(201);
                        res.send({
                          userId: result.insertedId,
                          login: user.login,
                          name: user.name,
                          groups: user.groups,
                        });
                      }
                    });
              });
            });
          } else {
            res.status(400);
            res.send('User already exists.');
          }
        }
      });
    }
  });

  app.post('/api/login', (req, res) => {
    const { login, password } = req.body;
    if (login == null || password == null) {
      res.status(400);
      res.send('Specify { login, password }');
    } else {
      mongodb.collection('user').findOne({ login }, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('Database error');
        } else {
          bcrypt.compare(password, result.password, (_, match) => {
            if (match) {
              res.send({ userId: result._id, name: result.name, groups: result.groups });
            } else {
              res.status(401);
              res.send('Unauthorized');
            }
          });
        }
      });
    }
  });

  app.post('/api/group', requireAuth, (req, res) => {
    const { userId, groupName } = req.body;
    if (groupName == null) {
      res.status(400);
      res.send('Specify { userId, groupName }');
    } else {
      const group = {
        name: groupName,
        members: [new mongo.ObjectID(userId)],
        messages: [],
      };
      mongodb.collection('group').insertOne(group, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('Database error');
        } else {
          mongodb.collection('user')
            .updateOne(
              { _id: new mongo.ObjectID(userId) },
              { '$push': { groups: new mongo.ObjectID(result.insertedId) } },
              (err, _) => {
                if (err) {
                  console.log(err);
                  res.status(500);
                  res.send('Database error');
                } else {
                  res.status(201);
                  res.send({ groupId: result.insertedId, name: groupName });
                }
              }
            );
        }
        });
      }
  });

  app.post('/api/join', requireAuth, (req, res) => {
    const { userId, groupId } = req.body;
    if (userId == null || groupId == null) {
      res.status(400);
      res.send('Specify { userId, groupId }');
    } else {
      mongodb.collection('group').updateOne(
        { _id: new mongo.ObjectID(groupId) },
        { '$addToSet': { members: new mongo.ObjectID(userId) }},
        (err, result) => {
          if (err) {
            res.status(500);
            res.send('Database error');
          } else {
            console.log(result);
            if (result.matchedCount === 0) {
              res.status(404);
              res.send(`Group id ${groupId} does not exist.`);
            } else if (result.modifiedCount === 0) {
              res.status(400);
              res.send('The user is already in this group.');
            } else {
              mongodb.collection('user').updateOne(
                { _id: new mongo.ObjectID(userId) },
                { '$addToSet': { groups: new mongo.ObjectID(groupId) } },
                (err, _) => {
                  if (err) {
                    res.status(500);
                    res.send('Database error');
                  } else {
                    res.send({ groupId });
                  }
                }
              );
            }
          }
        }
      );
    }
  });

  app.post('/api/leave', (req, res) => {
    const { userId, groupId } = req.body;
    // TODO
  });

  app.get('/api/group', (req, res) => {
    const { userId } = req.body;
    // TODO
  });

  app.get('/*', (_, res) => {
    res.status(404);
    res.send('Not found');
  })

  // socket.io event handlers go here
  sio.on('connection', (socket) => {
    socket.on('chat', (msg) => {
      // TODO
      const { senderId, senderName, text } = msg;
      console.log(`${senderName}[${senderId}]: ${text}`);
    });
  });

  // Start listening
  http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
});

