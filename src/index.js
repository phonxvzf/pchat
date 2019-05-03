const app = require('express')();
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http').Server(app);
const sio = require('socket.io')(http);
const mongo = require('mongodb');
const mongoClient = mongo.MongoClient;
const bcrypt = require('bcrypt');

const PORT = process.env.PORT || 3000;
const ANOTHER_PORT = (PORT == 3000) ? 3001 : 3000;
const ANOTHER_SERVER = (process.env.NODE_ENV === 'production') ? ((PORT == 3000) ? 'app2' : 'app1') : 'localhost';
const syncSocket = require('socket.io-client')(`http://${ANOTHER_SERVER}:${ANOTHER_PORT}`);

const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_URL = `mongodb://${MONGO_HOST}:27017/pchat`;

var mongodb = null;

const jsonParser = bodyParser.json();
const formParser = bodyParser.urlencoded({ extended: false });

// Initialize DB
mongoClient.connect(MONGO_URL, { useNewUrlParser: true }, (err, db) => {
  if (err) throw err;
  mongodb = db.db();

  // HTTP paths go here
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS'],
  }));

  app.use(jsonParser);
  app.use(formParser);

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
                  lastRead: [],
                  messageIds: [],
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
          if (result == null) {
            res.status(404);
            res.send('No such login');
          } else {
            bcrypt.compare(password, result.password, (_, match) => {
              if (match) {
                res.send({
                  userId: result._id,
                  name: result.name,
                  groups: result.groups,
                  lastRead: result.lastRead,
                  messageIds: result.messageIds,
                });
              } else {
                res.status(401);
                res.send('Unauthorized');
              }
            });
          }
        }
      });
    }
  });

  app.get('/allrooms', (_, res) => {
    mongodb.collection('rooms').find().toArray((err, result) => {
      if (err) {
        res.status(500).json('Database error');
      } else {
        res.send(result.map(x => x.room_name));
      }
    });
  });

  app.post('/allrooms', (req, res) => {
    mongodb.collection('rooms').updateOne(
      {
        room_name: req.body.id,
      },
      {
        $set: {
          room_name: req.body.id,
        },
        $setOnInsert: {
          members: [],
        },
      },
      {
        upsert: true,
      },
      (_, result) => {
        if (result.upsertedCount === 1) {
          res.status(201).send({ id: req.body.id });
        } else {
          res.status(404).json(`${req.body.id} already exists`);
        }
      }
    );
  });

  app.put('/allrooms', (req, res) => {
    mongodb.collection('rooms').updateOne(
      {
        room_name: req.body.id,
      },
      {
        $set: {
          room_name: req.body.id,
        },
        $setOnInsert: {
          members: [],
        },
      },
      {
        upsert: true,
      },
      (err, result) => {
        if (err) {
          res.status(500);
        } else {
          if (result.upsertedCount === 1) {
            res.status(201).send({ id: req.body.id });
          } else {
            res.status(200).send({ id: req.body.id });
          }
        }
      }
    );
  });

  app.delete('/allrooms', (req, res) => {
    mongodb.collection('rooms').deleteOne(
      {
        room_name: req.body.id,
      },
      (err, result) => {
        if (err) {
          res.status(404).json('Room id not found');
        } else {
          if (result.deletedCount === 0) {
            res.status(404).json('Room id not found');
          } else {
            res.status(200).json(`${req.body.id} is deleted`);
          }
        }
      },
    );
  });

  app.get('/room/:id', (req, res) => {
    mongodb.collection('rooms').findOne(
      {
        room_name: req.params.id,
      },
      (_, result) => {
        if (result == null) {
          res.status(404).json('Room does not exist');
        } else {
          res.status(200).send(result.members);
        }
      }
    );
  });

  function joinRoom(req, res) {
    mongodb.collection('rooms').updateOne(
      {
        room_name: req.params.id,
      },
      {
        $addToSet: {
          members: req.body.user,
        }
      },
      (_, result) => {
        if (result.modifiedCount === 0) {
          res.status(200).json({});
        } else {
          res.status(201).json({});
        }
      },
    );
  }

  app.post('/room/:id', joinRoom);
  app.put('/room/:id', joinRoom);

  app.delete('/room/:id', (req, res) => {
    mongodb.collection('rooms').updateOne(
      {
        room_name: req.params.id,
      },
      {
        $pull: {
          members: req.body.user,
        }
      },
      (_, result) => {
        if (result.modifiedCount === 0) {
          res.status(404).json('User id not found');
        } else {
          res.status(200).json(`${req.body.user} leaves the room`);
        }
      },
    );
  });

  app.get('/users', (_, res) => {
    mongodb.collection('rooms').find().toArray(
      (_, result) => {
        res.status(200).send(result.map(x => x.members).flat());
      }
    );
  });

  app.post('/api/group', requireAuth, (req, res) => {
    const { userId, groupName } = req.body;
    if (groupName == null) {
      res.status(400);
      res.send('Specify { userId, groupName }');
    } else {
      const group = {
        name: groupName,
        members: [{ userId: new mongo.ObjectID(userId), name: req.userData.name }],
        messages: [],
      };
      mongodb.collection('group').insertOne(group, (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('Database error');
        } else {
          mongodb.collection('user').updateOne(
            { _id: new mongo.ObjectID(userId) },
            { '$push': { lastRead: { groupId: new mongo.ObjectID(result.insertedId), messageId: null } } },
            (err, _) => {
              if (err) {
                console.log(err);
                res.status(500);
                res.send('Database error');
              } else {
                res.status(201);
                res.send({ groupId: result.insertedId });
              }
            }
          )
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
      mongodb.collection('group').findOneAndUpdate(
        { _id: new mongo.ObjectID(groupId) },
        { '$addToSet': { members: { userId: new mongo.ObjectID(userId), name: req.userData.name } } },
        (err, result) => {
          if (err) {
            res.status(500);
            res.send('Database error');
          } else {
            if (result.matchedCount === 0) {
              res.status(404);
              res.send(`Group id ${groupId} does not exist.`);
            } else if (result.modifiedCount === 0) {
              res.status(400);
              res.send('The user is already in this group.');
            } else {
              mongodb.collection('user').updateOne(
                { _id: new mongo.ObjectID(userId) },
                { '$addToSet': { lastRead: { groupId: new mongo.ObjectID(groupId), messageId: null } } },
                (err, _) => {
                  if (err) {
                    console.log(err);
                    res.status(500);
                    res.send('Database error');
                  } else {
                    res.send({ groupId, groupName: result.value.name });
                  }
                }
              )
            }
          }
        }
      );
    }
  });

  app.post('/api/leave', requireAuth, (req, res) => {
    const { userId, groupId } = req.body;
    if (userId == null || groupId == null) {
      res.status(400);
      res.send('Specify { userId, groupId }');
    } else {
      mongodb.collection('group').updateOne(
        { _id: new mongo.ObjectID(groupId) },
        { '$pull': { members: { userId: new mongo.ObjectID(userId) } } },
        (err, result) => {
          if (err) {
            console.log(err);
            res.status(500);
            res.send('Database error');
          } else {
            if (result.modifiedCount == null || result.modifiedCount === 0) {
              res.status(400);
              res.send('Either the user is not in the group or the group does not exist.');
            } else {
              mongodb.collection('user').updateOne(
                {
                  _id: new mongo.ObjectID(userId),
                  lastRead: {
                    '$elemMatch': { groupId: { '$eq': new mongo.ObjectID(groupId) } }
                  },
                },
                { '$pull': { lastRead: { groupId: new mongo.ObjectID(groupId) } } },
                (err, _) => {
                  if (err) {
                    console.log(err);
                    res.status(500);
                    res.send('Database error');
                  } else {
                    res.send({ groupId });
                  }
                }
              )
            }
          }
        }
      )
    }
  });

  app.post('/api/memberOf', requireAuth, (req, res) => {
    const { userId } = req.body;
    mongodb.collection('group').aggregate(
      [
        { '$match': { members: { '$elemMatch': { userId: { '$eq': new mongo.ObjectID(userId) } } } } },
        { '$project': { 'groupId': '$_id', 'name': '$name', 'members': '$members.name' } },
        { '$project': { '_id': 0 } }
      ]
    ).toArray(
      (err, result) => {
        if (err) {
          console.log(err);
          res.status(500);
          res.send('Database error');
        } else {
          res.send(result);
        }
      }
    );
  });

  app.get('/*', (_, res) => {
    res.status(404);
    res.send('Not found');
  });

  app.post('/*', (_, res) => {
    res.status(404);
    res.send('Not found');
  });

  sio.on('connection', (socket) => {
    socket.on('syncNewMessage', (msg) => {
      sio.to(msg.groupId).emit('newMessage', { groupId: msg.groupId });
    })

    socket.on('join', (room) => {
      if (room != '' && room.length === 24) {
        mongodb.collection('group').findOne(
          { _id: new mongo.ObjectID(room) },
          (err, result) => {
            if (err) {
              console.log(err);
              socket.emit('errorMessage', 'Database error');
            } else {
              if (result == null) {
                socket.emit('errorMessage', `Group id ${room} does not exist.`);
              } else {
                socket.join(room, () => {
                  socket.emit('joinACK', { groupId: room, groupName: result.name, messages: result.messages });
                });
              }
            }
          }
        );
      }
    });

    socket.on('leave', (room) => {
      socket.leave(room, () => {
        socket.emit('leaveACK', room);
      });
    });

    socket.on('getUnread', (msg) => {
      const { userId, groupId } = msg;
      if (userId == null || groupId == null) {
        socket.emit('errorMessage', 'getUnread: provide { userId, groupId }');
      } else {
        mongodb.collection('user').findOne(
          { _id: new mongo.ObjectID(userId) },
          (err, result) => {
            if (err) {
              console.log(err);
              socket.emit('errorMessage', 'Database error');
            } else {
              if (result == null) {
                socket.emit('errorMessage', `User is not in group ${groupId}`);
              } else {
                let lastReadMessageId = null;
                for (let i = 0; i < result.lastRead.length; ++i) {
                  if (result.lastRead[i].groupId.toString() === groupId) {
                    lastReadMessageId = result.lastRead[i].messageId;
                    break;
                  }
                }
                mongodb.collection('group').findOne(
                  { _id: new mongo.ObjectID(groupId) },
                  (err, result) => {
                    if (err) {
                      console.log(err);
                      socket.emit('errorMessage', 'Database error');
                    } else {
                      const messages = result.messages;
                      const unread = [];
                      let i = 0;
                      if (lastReadMessageId != null) {
                        while (i < messages.length && (messages[i].messageId != lastReadMessageId)) ++i;
                        ++i;
                      }
                      for (; i < messages.length; ++i) {
                        unread.push(messages[i]);
                      }
                      socket.emit('unreadMessage', { groupId, unread });
                    }
                  }
                );
              }
            }
          }
        )
      }
    });

    socket.on('unreadMessageACK', (msg) => {
      const { userId, groupId, messageId } = msg;
      mongodb.collection('user').updateOne(
        {
          _id: new mongo.ObjectID(userId),
          lastRead: {
            '$elemMatch': {
              groupId: {
                '$eq': new mongo.ObjectID(groupId),
              }
            }
          },
        },
        { '$set': { 'lastRead.$.messageId': messageId } },
        (err, _) => {
          if (err) {
            console.log(err);
            socket.emit('errorMessage', 'Database error');
          }
        }
      );
    });

    socket.on('message', (msg) => {
      const { userId, messageId, groupId, senderName, text } = msg;
      if (userId == null || messageId == null || groupId == null || senderName == null || text == null) {
        socket.emit('errorMessage', 'Provide { userId, messageId, groupId, senderName, text }');
      } else {
        const message = {
          messageId,
          senderName,
          text,
          time: new Date(),
        };
        mongodb.collection('group').updateOne(
          { _id: new mongo.ObjectID(groupId) },
          { '$push': { messages: message } },
          (err, _) => {
            if (err) {
              console.log(err);
              socket.emit('errorMessage', 'Database error');
            } else {
              mongodb.collection('user').updateOne(
                { _id: new mongo.ObjectID(userId) },
                { '$addToSet': { messageIds: messageId } },
                (err, _) => {
                  if (err) {
                    console.log(err);
                    socket.emit('errorMessage', 'Database error');
                  } else {
                    sio.to(groupId).emit('newMessage', { groupId });
                    syncSocket.emit('syncNewMessage', { groupId });
                  }
                }
              )
            }
          }
        )
      }
    });
  });

  // Start listening
  http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`);
  });
});

