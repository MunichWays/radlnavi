#!/bin/bash

echo "building backend service ..."
docker build --network=host -f ./backend/Dockerfile ./backend -t gcr.io/radlnavi/backend
echo "building backend service done."

echo "building frontend service ..."
docker build --network=host -f ./frontend/Dockerfile ./frontend -t gcr.io/radlnavi/frontend
echo "building frontend service done."
