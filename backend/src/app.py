from __future__ import annotations
from collections import defaultdict
from dataclasses import dataclass, field
from json import loads
import sqlite3
from geopy import distance

from requests import request
from pbf_handler import PbfHandler
import os
from typing import Optional

from contextlib import asynccontextmanager
from fastapi import FastAPI

script_dir = os.path.dirname(os.path.abspath(__file__))
geo_store: Optional[sqlite3.Connection] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global geo_store
    geo_store = load_geo_store()
    yield
    pass


app = FastAPI(lifespan=lifespan)


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


@app.get("/")
async def root():
    start = [48.163889, 11.577195]
    end = [48.171819, 11.595226]

    response = request(
        "GET",
        f"http://localhost:8080/route/v1/bike/{start[1]},{start[0]}%3b{end[1]},{end[0]}%3Foverview=full&alternatives=true&steps=true&geometries=geojson&annotations=true",
    )
    if response.status_code != 200:
        return {"ok": False}
    
    osrm_response = response.json()

    node_ids = osrm_response["routes"][0]["legs"][0]["annotation"]["nodes"]

    assert geo_store is not None

    nodes_by_id = retrieve_nodes_by_id(geo_store, node_ids)
    ways_by_id = retrieve_ways_by_node_ids(geo_store, node_ids)

    route_nodes = list(map(lambda id: nodes_by_id[id], node_ids))

    # correct start and end of route
    route_nodes[0].lon = start[1]
    route_nodes[0].lat = start[0]
    route_nodes[-1].lon = end[1]
    route_nodes[-1].lat = end[0]

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

    interesting_tags = ["class:bicycle"]
    tag_info: dict[str, dict[str, TagInfo]] = defaultdict(lambda: defaultdict(TagInfo))
    for way_id, nodes in route_ways.items():
        way = ways_by_id[way_id]
        for tag in interesting_tags:
            if tag in way.tags:
                tag_info[tag][way.tags[tag]].ways[way_id] = WayInfo(
                    way.tags.get("name", ""),
                    LineStringGeometry(
                        list(map(lambda node: node.coord, nodes))
                    )
                )
                for node_a, node_b in zip(nodes, nodes[1:]):
                    tag_info[tag][way.tags[tag]].distance += distance.distance(
                        node_a.location, node_b.location
                    ).meters

    return {
        "ok": True,
        "route": {
            "annotation": osrm_response["routes"][0]["legs"][0]["annotation"],
            "steps": osrm_response["routes"][0]["legs"][0]["steps"],
            "geometry": osrm_response["routes"][0]["geometry"],
            "duration": osrm_response["routes"][0]["duration"],
            "distance": osrm_response["routes"][0]["distance"],
            "tag_distribution": tag_info,
        }
    }


def load_geo_store() -> sqlite3.Connection:
    geo_folder = os.path.join(script_dir, "../geo")
    if not os.path.exists(os.path.join(geo_folder, "geo.db")):
        print("initializing database ...")
        db_con = sqlite3.connect(os.path.join(geo_folder, "geo.db"))
        print("creating nodes table")
        db_con.execute(
            "CREATE TABLE nodes (id INTEGER PRIMARY KEY ASC, lat FLOAT, lon FLOAT, tags VARCHAR);"
        )
        print("creating ways table")
        db_con.execute(
            "CREATE TABLE ways (id INTEGER PRIMARY KEY ASC, node_list VARCHAR, tags VARCHAR);"
        )
        print("creating node_to_ways table")
        db_con.execute(
            "CREATE TABLE node_to_ways (node_id INTEGER, way_id INTEGER, CONSTRAINT fk_node_id FOREIGN KEY (node_id) REFERENCES nodes(id), CONSTRAINT fk_way_id FOREIGN KEY (way_id) REFERENCES ways(id));"
        )
        db_con.execute("CREATE INDEX node_to_ways_node_id ON node_to_ways (node_id)")
        db_con.execute("CREATE INDEX node_to_ways_way_id ON node_to_ways (way_id)")
        handler = PbfHandler(db_con)
        handler.apply_file(os.path.join(geo_folder, "oberbayern-latest.osm.pbf"))
        handler.cleanup()
        print("done.")
    else:
        print("reusing database ...")
        db_con = sqlite3.connect(os.path.join(geo_folder, "geo.db"))
    return db_con
