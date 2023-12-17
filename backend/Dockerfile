FROM alpine:latest AS map

RUN wget https://download.geofabrik.de/europe/germany/bayern-latest.osm.pbf -O /opt/map.osm.pbf

FROM osrm/osrm-backend:v5.25.0 AS builder

COPY --from=map /opt/map.osm.pbf /data/map.osm.pbf
COPY bike.lua /opt/bike.lua
RUN osrm-extract -p /opt/bike.lua /data/map.osm.pbf
RUN osrm-partition /data/map.osm.pbf
RUN osrm-customize /data/map.osm.pbf

FROM osrm/osrm-backend:v5.25.0

COPY --from=builder /data /data

ENV PORT 8080

CMD osrm-routed --algorithm mld --port $PORT /data/map.osrm