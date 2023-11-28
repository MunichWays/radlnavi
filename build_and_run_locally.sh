#!/bin/bash

if [ "$1" != "--backend-only" ]; then
    echo "building frontend service ..."
    docker build --network=host --build-arg BACKEND_URL="http://localhost:8080" --build-arg VERSION="dev" -f ./frontend/Dockerfile -t radlnavi-frontend ./frontend
    echo "building frontend service done."
else
    echo "-- skipping frontend build --"
    echo
fi

if [ "$1" != "--frontend-only" ]; then
    echo "building backend service ..."
    docker build --network=host -f ./backend/Dockerfile -t radlnavi-backend ./backend
    echo "building backend service done."
else
    echo "-- skipping backend build --"
    echo
fi

docker stop radlnavi-frontend radlnavi-backend
sleep 1

docker run --rm -d -p 8080:8080 --name radlnavi-backend radlnavi-backend
docker run --rm -d -p 9966:80 --name radlnavi-frontend radlnavi-frontend
