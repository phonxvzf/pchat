#!/bin/sh
while curl --silent http://app1:3000/port > /dev/null; [ $? -ne 0 ]; do
  echo 'Waiting for app1 to be online...';
  sleep 3;
done

while curl --silent http://app2:3001/port > /dev/null; [ $? -ne 0 ]; do
  echo 'Waiting for app2 to be online...';
  sleep 3;
done

echo 'OK. Starting nginx...';

nginx -g 'daemon off;';
