#!/bin/sh
while curl --silent db:27017; [ $? -ne 0 ]; do
  echo 'Waiting for MongoDB to be ready...';
  sleep 3;
done

npm start;
