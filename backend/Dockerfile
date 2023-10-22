FROM osrm/osrm-backend as builder

COPY ./geo/oberbayern-latest.osm.pbf /data/map.osm.pbf
COPY bike.lua /opt/bike.lua
RUN osrm-extract -p /opt/bike.lua /data/map.osm.pbf
RUN osrm-partition /data/map.osm.pbf
RUN osrm-customize /data/map.osm.pbf

FROM osrm/osrm-backend

COPY --from=builder /data /data

ENV PORT 8080

CMD osrm-routed --algorithm mld --port $PORT /data/map.osrm