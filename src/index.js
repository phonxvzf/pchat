const app = require('express')();
const mongo = require('mongodb').MongoClient;

const PORT = process.env.PORT || 3000;
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_URL = `mongodb://${MONGO_HOST}:27017/pchat`;

var mongodb = null;

mongo.connect(MONGO_URL, (err, db) => {
  if (err) {
    console.log(err);
  } else {
    mongodb = db.db();
  }
});

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

app.get('/*', (_, res) => {
  res.status(404);
  res.send('Not found');
})

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
