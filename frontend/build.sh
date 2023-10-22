#!/bin/bash

BACKEND_URL="https://routing.floschnell.de"
if [ "$1" != "" ]; then
    BACKEND_URL="$1"
fi

echo "downloading munichways annotation ..."
node load_munichways.mjs
echo "downloading munichways annotation done."

echo "building react application ..."
REACT_APP_OSRM_BACKEND="$BACKEND_URL" npm run build
echo "building react application done."

docker build -f Dockerfile . -t radlnavi-frontend