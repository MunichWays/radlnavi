#!/bin/bash

echo "building backend service ..."
cd backend
./build.sh
cd -
echo "building backend service done."

echo "building frontend service ..."
cd frontend
./build.sh "http://localhost:8080"
cd -
echo "building frontend service done."

docker stop radlnavi-frontend radlnavi-backend
sleep 1

docker run --rm -d -p 8080:8080 --name radlnavi-backend radlnavi-backend
docker run --rm -d -p 9966:80 --name radlnavi-frontend radlnavi-frontend
