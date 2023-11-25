#!/bin/bash

echo "building backend service ..."
docker build --network=host -f ./backend/Dockerfile -t radlnavi-backend ./backend
echo "building backend service done."

echo "building frontend service ..."
docker build --network=host --build-arg BACKEND_URL="http://localhost:8080" -f ./frontend/Dockerfile -t radlnavi-frontend ./frontend
echo "building frontend service done."

docker stop radlnavi-frontend radlnavi-backend
sleep 1

docker run --rm -d -p 8080:8080 --name radlnavi-backend radlnavi-backend
docker run --rm -d -p 9966:80 --name radlnavi-frontend radlnavi-frontend
