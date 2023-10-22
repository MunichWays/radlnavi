import * as fs from "fs";
import osmtogeojson from "osmtogeojson";

const SOUTH_WEST = {
    lng: 10.334022,
    lat: 47.286771,
  };
  
  const NORTH_EAST = { lat: 49.096737, lng: 13.926551 };

function translateColor(color) {
    switch (color) {
        case "rot":
            return 'red';
        case "grün":
            return 'green';
        case "gelb":
            return 'yellow';
        case "schwarz":
            return 'black';
        case "grau":
            return 'grey';
        default:
            return 'blue';
    }
}

function translateClassBicycle(clBicycle) {
    switch (clBicycle) {
        case "-2":
            return "black";
        case "-1":
            return "red";
        case "1":
            return "yellow";
        case "2":
            return "green";
        default:
            return "blue";
    }
}

async function loadMunichwaysJson() {
    console.log("Loading munichways json");
    const munichwaysJsonResponse = await fetch("https://overpass-api.de/api/interpreter",
        {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "application/json",
            },
            body: `data=%5Bout%3Ajson%5D%5Btimeout%3A25%5D%3B%0A%2F%2F+gather+results%0A(%0A++%2F%2F+query+part+for%3A+%E2%80%9C%22class%3Abicycle%22%3D*%E2%80%9D%0A++node%5B%22class%3Abicycle%22%5D(${SOUTH_WEST.lat}%2C${SOUTH_WEST.lng}%2C${NORTH_EAST.lat}%2C${NORTH_EAST.lng})%3B%0A++way%5B%22class%3Abicycle%22%5D(47.87997345949157%2C11.333770751953127%2C48.27816644235732%2C11.74919128417969)%3B%0A++relation%5B%22class%3Abicycle%22%5D(${SOUTH_WEST.lat}%2C${SOUTH_WEST.lng}%2C${NORTH_EAST.lat}%2C${NORTH_EAST.lng})%3B%0A)%3B%0A%2F%2F+print+results%0Aout+body%3B%0A%3E%3B%0Aout+skel+qt%3B`,
            method: "POST"
        });
    const munichwaysDataOSM = await munichwaysJsonResponse.json();
    const munichwaysData = osmtogeojson(munichwaysDataOSM);
    console.log("Transforming munichways json");
    const munichwaysDataCopy = {
        ...munichwaysData,
        features: munichwaysData.features.filter((feature) => feature.geometry.type === "LineString" || feature.geometry.type === "MultiLineString").map((feature) => ({
            geometry: feature.geometry,
            properties: {
                color: translateClassBicycle(feature.properties["class:bicycle"]),
                happy_bike_level: feature.properties.happy_bike_level || "NA",
                description: feature.properties.ist_situation || "NA",
            },
            type: feature.type,
        })),
    };
    console.log("Writing munichways json");
    const munichwaysDataCopyJson = JSON.stringify(munichwaysDataCopy);
    fs.writeFileSync("./public/munichways.json", munichwaysDataCopyJson);
}

loadMunichwaysJson();