from __future__ import annotations

import os
import sqlite3
from collections import defaultdict
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from json import loads
from typing import List, Optional

from pydantic import BaseModel

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from geopy import distance
from requests import request

script_dir = os.path.dirname(os.path.abspath(__file__))

@dataclass
class Node(object):
    id: int
    lat: float
    lon: float
    tags: dict[str, str]

    @property
    def location(self) -> tuple[float, float]:
        return (self.lat, self.lon)

    @property
    def coord(self) -> tuple[float, float]:
        return (self.lon, self.lat)


@dataclass
class Way(object):
    id: int
    nodes: list[int]
    tags: dict[str, str]

def get_geo_store() -> sqlite3.Connection:
    geo_folder = os.path.join(script_dir, "../geo")
    geo_store_path = os.path.join(geo_folder, "geo.db")
    geo_store_exists = os.path.exists(geo_store_path)
    if not geo_store_exists:
        raise Exception(f"geo store '{geo_store_path}' does not exist!")
    else:
        db_con = sqlite3.connect(f"file:{geo_store_path}?mode=ro&immutable=1&nolock=1", uri=True, isolation_level="EXCLUSIVE")
        return db_con

geo_store: Optional[sqlite3.Connection] = None
OSRM_BACKEND_URL = os.environ["OSRM_BACKEND_URL"]

origins = [
    "http://localhost",
    "http://localhost:8000",
    "http://localhost:3000",
    "https://www.radlnavi.de",
    "https://radlnavi.de",
]

@asynccontextmanager
async def lifespan(_: FastAPI):
    global geo_store
    geo_store = get_geo_store()
    yield
    pass


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@dataclass
class LineStringGeometry(object):
    coordinates: list[tuple[float, float]]
    type: str = "LineString"


@dataclass
class WayInfo(object):
    name: str
    geometry: LineStringGeometry


@dataclass
class TagInfo(object):
    distance: float = 0.0
    ways: dict[int, WayInfo] = field(default_factory=lambda: dict())


def retrieve_nodes_by_id(
    db_con: sqlite3.Connection, node_ids: list[int]
) -> dict[int, Node]:
    c = db_con.cursor()
    c.execute(
        f"SELECT id, lat, lon, tags FROM nodes WHERE id IN ({','.join('?' * len(node_ids))})",
        node_ids,
    )
    node_data = c.fetchall()
    nodes_by_id = dict(
        map(
            lambda node: (node[0], Node(node[0], node[1], node[2], loads(node[3]))),
            node_data,
        )
    )
    return nodes_by_id


def retrieve_ways_by_node_ids(
    db_con: sqlite3.Connection, node_ids: list[int]
) -> dict[int, Way]:
    c = db_con.cursor()
    c.execute(
        f"SELECT w.id, w.node_list, w.tags FROM node_to_ways ntw INNER JOIN ways w ON (ntw.way_id = w.id) WHERE ntw.node_id IN ({','.join('?' * len(node_ids))})",
        node_ids,
    )
    ways = c.fetchall()
    way_by_id = dict(
        map(lambda way: (way[0], Way(way[0], loads(way[1]), loads(way[2]))), ways)
    )

    return way_by_id

class NodeList(BaseModel):
    node_ids: List[int]

@app.post("/tag_distribution")
async def tag_distribution(
    node_list: NodeList
):
    assert geo_store is not None

    node_ids = node_list.node_ids
    print("retrieve nodes by id start")
    nodes_by_id = retrieve_nodes_by_id(geo_store, node_ids)
    print("retrieve nodes by id end")
    ways_by_id = retrieve_ways_by_node_ids(geo_store, node_ids)
    print("retrieve ways end")
    route_nodes = list(filter(None, map(lambda id: nodes_by_id.get(id), node_ids)))

    # fix start and end of route
    # route_nodes[0].lon = route_coords[0][0]
    # route_nodes[0].lat = route_coords[0][1]
    # route_nodes[-1].lon = route_coords[-1][0]
    # route_nodes[-1].lat = route_coords[-1][1]

    # retrieve route information
    route_ways: dict[int, list[Node]] = defaultdict(list)
    for node_a, node_b in zip(route_nodes, route_nodes[1:]):
        ways = filter(
            lambda way: node_a.id in way.nodes
            and node_b.id in way.nodes
            and abs(way.nodes.index(node_a.id) - way.nodes.index(node_b.id)) == 1,
            ways_by_id.values(),
        )
        for way in ways:
            way_nodes = route_ways[way.id]
            if len(way_nodes) > 0 and way_nodes[-1] == node_a:
                way_nodes.append(node_b)
            else:
                way_nodes.append(node_a)
                way_nodes.append(node_b)

    interesting_tags = ["class:bicycle", "lit", "surface"]
    tag_distribution: dict[str, dict[str, TagInfo]] = defaultdict(lambda: defaultdict(TagInfo))
    for way_id, nodes in route_ways.items():
        way = ways_by_id[way_id]
        for tag in interesting_tags:
            way_tag_value = way.tags.get(tag, "unknown")
            tag_distribution[tag][way_tag_value].ways[way_id] = WayInfo(
                way.tags.get("name", ""),
                LineStringGeometry(list(map(lambda node: node.coord, nodes))),
            )
            for node_a, node_b in zip(nodes, nodes[1:]):
                tag_distribution[tag][way_tag_value].distance += distance.distance(
                    node_a.location, node_b.location
                ).meters

    return {
        "ok": True,
        "tag_distribution": tag_distribution,
    }


@app.get("/route")
async def route(
    start_lat: float, start_lon: float, target_lat: float, target_lon: float
):
    print("request start")
    response = request(
        "GET",
        f"{OSRM_BACKEND_URL}/route/v1/bike/{start_lon},{start_lat}%3b{target_lon},{target_lat}%3Foverview=full&alternatives=true&steps=true&geometries=geojson&annotations=true",
        timeout=30,
    )

    if response.status_code != 200:
        return {"ok": False}

    print("response start")
    osrm_response = response.json()
    print("response end")

    return {
        "ok": True,
        "route": {
            "annotation": osrm_response["routes"][0]["legs"][0]["annotation"],
            "steps": osrm_response["routes"][0]["legs"][0]["steps"],
            "geometry": osrm_response["routes"][0]["geometry"],
            "duration": osrm_response["routes"][0]["duration"],
            "distance": osrm_response["routes"][0]["distance"],
        },
    }
