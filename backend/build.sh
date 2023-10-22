mkdir -p ./geo

# get latest osm data
echo "downloading latest OSM data for bayern/oberbayern ..."
if [ ! -f ./geo/oberbayern-latest.osm.pbf ]; then
    curl --insecure https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf -o ./geo/oberbayern-latest.osm.pbf
else
    echo "skipping since file already present."
fi

docker build -f Dockerfile . -t radlnavi-backend