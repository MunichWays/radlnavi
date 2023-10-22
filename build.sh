#!/bin/bash

echo "building backend service ..."
cd backend
./build.sh
cd -
docker tag radlnavi-backend gcr.io/radlnavi/backend
echo "building backend service done."

echo "building frontend service ..."
cd frontend
./build.sh
cd -
docker tag radlnavi-frontend gcr.io/radlnavi/frontend
echo "building frontend service done."
