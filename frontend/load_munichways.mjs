import * as fs from "fs";
import osmRead from 'osm-read';
import * as poly2geojson from 'polytogeojson';

function translateClassBicycle(clBicycle) {
    switch (clBicycle) {
        case "-3":
            return "black";
        case "-2":
            return "black";
        case "-1":
            return "red";
        case "1":
            return "yellow";
        case "2":
            return "green";
        case "3":
            return "green";
        default:
            return "blue";
    }
}

const mapPoly = fs.readFileSync("./map.poly")
const polyGeoJson = poly2geojson.default(mapPoly.toString("utf-8"));
fs.writeFileSync("./public/region.json", JSON.stringify(polyGeoJson));

// extracting relevant ways
console.log("PASS 1: extracting bicycle ways ...")
const bicycleWays = [];
const nodeRefs = new Map();
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        way: (way) => {
            if (way.tags && way.tags["class:bicycle"]) {
                bicycleWays.push(way);
                for (const nodeRef of way.nodeRefs) {
                    nodeRefs.set(nodeRef, null);
                }
            }
        },
        endDocument: resolve,
    })
})
console.log("loaded", bicycleWays.length, "bicycle ways.")

// extracting relevant nodes
console.log("PASS 2: extracting relevant node information ...")
await new Promise((resolve) => {
    osmRead.parse({
        filePath: "map.osm.pbf",
        node: (node) => {
            if (nodeRefs.has(node.id)) {
                nodeRefs.set(node.id, node);
            }
        },
        endDocument: resolve,
    })
})
console.log("loaded", [...nodeRefs.keys()].length, "nodes.");

// building GeoJSON
console.log("building geometries ...");
const features = [];
for (const way of bicycleWays) {
    way.nodes = 
    features.push({
        type: "Feature",
        geometry: {
            type: "LineString",
            coordinates: way.nodeRefs.map((nodeRef) => nodeRefs.get(nodeRef)).map((node) => [node.lon, node.lat]),
        },
        properties: {
            color: translateClassBicycle(way.tags["class:bicycle"]),
        }
    });
}
const geoJson = {
    type: "FeatureCollection",
    features,
}
console.log("writing output file public/munichways.json ...")
fs.writeFileSync("./public/munichways.json", JSON.stringify(geoJson));

console.log("done!")