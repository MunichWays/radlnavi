from json import dumps
import sqlite3
import osmium
import os

script_dir = os.path.dirname(os.path.abspath(__file__))


def build_geo_store():
    print("initializing geo store ...")
    geo_folder = os.path.join(script_dir, "../geo")
    geo_store_path = os.path.join(geo_folder, "geo.db")
    pbf_path = os.path.join(geo_folder, "oberbayern-latest.osm.pbf")
    db_con = sqlite3.connect(geo_store_path)
    __initialize_geo_store(db_con, pbf_path)
    db_con.close()


def get_geo_store(create: bool = False) -> sqlite3.Connection:
    geo_folder = os.path.join(script_dir, "../geo")
    geo_store_path = os.path.join(geo_folder, "geo.db")
    geo_store_exists = os.path.exists(geo_store_path)
    db_con = sqlite3.connect(geo_store_path)
    if not geo_store_exists:
        raise Exception(f"geo store '{geo_store_path}' does not exist!")
    else:
        print("store exists, loading into memory ...")
        mem_db_con = sqlite3.connect(":memory:")
        db_con.backup(mem_db_con)
        print("done.")
    db_con.close()
    return mem_db_con


def __initialize_geo_store(db_con: sqlite3.Connection, pbf_path: str) -> None:
    print("creating nodes table")
    db_con.execute(
        """CREATE TABLE nodes (
            id INTEGER PRIMARY KEY ASC,
            lat FLOAT,
            lon FLOAT,
            tags VARCHAR
        );"""
    )
    print("creating ways table")
    db_con.execute(
        """CREATE TABLE ways (
            id INTEGER PRIMARY KEY ASC,
            node_list VARCHAR,
            tags VARCHAR
        );"""
    )
    print("creating node_to_ways table")
    db_con.execute(
        """CREATE TABLE node_to_ways (
            node_id INTEGER,
            way_id INTEGER,
            CONSTRAINT fk_node_id FOREIGN KEY (node_id) REFERENCES nodes(id),
            CONSTRAINT fk_way_id FOREIGN KEY (way_id) REFERENCES ways(id)
        );"""
    )
    db_con.execute("CREATE INDEX node_to_ways_node_id ON node_to_ways (node_id)")
    db_con.execute("CREATE INDEX node_to_ways_way_id ON node_to_ways (way_id)")
    handler = GeoStoreInitHandler(db_con)
    handler.apply_file(pbf_path)
    handler.finalize()
    print("done.")


class GeoStoreInitHandler(osmium.SimpleHandler):
    def __init__(self, db_con: sqlite3.Connection):
        super(GeoStoreInitHandler, self).__init__()
        self.__db_con = db_con
        self.__nodes_batch = []
        self.__node_to_way_batch = []
        self.__ways_batch = []

    def node(self, n):
        tags_str = dumps(dict([(tag.k, tag.v) for tag in n.tags]))
        self.__nodes_batch.append((n.id, n.location.lat, n.location.lon, tags_str))
        if len(self.__nodes_batch) >= 10000:
            print("n", end="", flush=True)
            cursor = self.__db_con.cursor()
            cursor.executemany(
                "INSERT INTO nodes (id, lat, lon, tags) VALUES (?, ?, ?, ?)",
                self.__nodes_batch,
            )
            self.__db_con.commit()
            self.__nodes_batch.clear()

    def way(self, w):
        for node in w.nodes:
            self.__node_to_way_batch.append((node.ref, w.id))
        node_list_str = dumps([node.ref for node in w.nodes])
        tags_str = dumps(dict([(tag.k, tag.v) for tag in w.tags]))
        self.__ways_batch.append((w.id, node_list_str, tags_str))
        if len(self.__ways_batch) >= 5000:
            print("w", end="", flush=True)
            cursor = self.__db_con.cursor()
            cursor.executemany(
                "INSERT INTO ways (id, node_list, tags) VALUES (?, ?, ?)",
                self.__ways_batch,
            )
            cursor.executemany(
                "INSERT INTO node_to_ways (node_id, way_id) VALUES (?, ?)",
                self.__node_to_way_batch,
            )
            self.__db_con.commit()
            self.__ways_batch.clear()
            self.__node_to_way_batch.clear()

    def finalize(self):
        cursor = self.__db_con.cursor()
        cursor.executemany(
            "INSERT INTO nodes (id, lat, lon, tags) VALUES (?, ?, ?, ?)",
            self.__nodes_batch,
        )
        cursor.executemany(
            "INSERT INTO ways (id, node_list, tags) VALUES (?, ?, ?)", self.__ways_batch
        )
        cursor.executemany(
            "INSERT INTO node_to_ways (node_id, way_id) VALUES (?, ?)",
            self.__node_to_way_batch,
        )
        self.__db_con.commit()
        self.__nodes_batch.clear()
        self.__ways_batch.clear()
        self.__node_to_way_batch.clear()
