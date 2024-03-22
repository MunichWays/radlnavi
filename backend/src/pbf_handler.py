from dataclasses import dataclass
from json import dumps
import sqlite3
import osmium

@dataclass
class Location(object):
    lat: float
    lon: float

@dataclass
class Node(object):
    id: int
    location: Location
    tags: dict[str, str]

@dataclass
class Way(object):
    id: int
    node_ids: list[int]
    tags: dict[str, str]

class PbfHandler(osmium.SimpleHandler):
    def __init__(self, db_con: sqlite3.Connection):
        super(PbfHandler, self).__init__()
        self.__db_con = db_con
        self.__nodes_batch = []
        self.__node_to_way_batch = []
        self.__ways_batch = []

    def node(self, n):
        tags_str = dumps(dict([(tag.k, tag.v) for tag in n.tags]))
        self.__nodes_batch.append((n.id, n.location.lat, n.location.lon, tags_str))
        if len(self.__nodes_batch) >= 10000:
            print("n",end="",flush=True)
            cursor = self.__db_con.cursor()
            cursor.executemany("INSERT INTO nodes (id, lat, lon, tags) VALUES (?, ?, ?, ?)", self.__nodes_batch)
            self.__db_con.commit()
            self.__nodes_batch.clear()
        

    def way(self, w):
        for node in w.nodes:
            self.__node_to_way_batch.append((node.ref, w.id))
        node_list_str = dumps([node.ref for node in w.nodes])
        tags_str = dumps(dict([(tag.k, tag.v) for tag in w.tags]))
        self.__ways_batch.append((w.id, node_list_str, tags_str))
        if len(self.__ways_batch) >= 5000:
            print("w",end="",flush=True)
            cursor = self.__db_con.cursor()
            cursor.executemany("INSERT INTO ways (id, node_list, tags) VALUES (?, ?, ?)", self.__ways_batch)
            cursor.executemany("INSERT INTO node_to_ways (node_id, way_id) VALUES (?, ?)", self.__node_to_way_batch)
            self.__db_con.commit()
            self.__ways_batch.clear()
            self.__node_to_way_batch.clear()

    def cleanup(self):
        cursor = self.__db_con.cursor()
        cursor.executemany("INSERT INTO nodes (id, lat, lon, tags) VALUES (?, ?, ?, ?)", self.__nodes_batch)
        cursor.executemany("INSERT INTO ways (id, node_list, tags) VALUES (?, ?, ?)", self.__ways_batch)
        cursor.executemany("INSERT INTO node_to_ways (node_id, way_id) VALUES (?, ?)", self.__node_to_way_batch)
        self.__db_con.commit()
        self.__nodes_batch.clear()
        self.__ways_batch.clear()
        self.__node_to_way_batch.clear()
    