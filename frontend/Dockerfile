FROM node:18.16-buster AS builder

RUN git clone https://github.com/mapbox/tippecanoe.git
RUN cd tippecanoe && make -j && make install && cd -

ARG BACKEND_URL="https://backend.radlnavi.de"
ARG VERSION="v1"
ARG REGION="europe/germany/bayern/oberbayern"

COPY public public
COPY src src
COPY load_munichways.mjs load_munichways.mjs
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY tsconfig.json tsconfig.json

RUN npm install --verbose --force

# build class:bicycle map overlay
RUN wget "https://download.geofabrik.de/${REGION}-latest.osm.pbf" -O ./map.osm.pbf
RUN wget "https://download.geofabrik.de/${REGION}.poly" -O ./map.poly
RUN node load_munichways.mjs
RUN mkdir ./public/layers
RUN ./tippecanoe/tippecanoe --maximum-zoom=19 --no-tile-compression -e ./public/layers/munichways ./public/munichways.json

RUN REACT_APP_BACKEND_URL="$BACKEND_URL" REACT_APP_VERSION="$VERSION" npm run build

FROM ubuntu/nginx

ENV PORT 80

COPY --from=builder build /var/www/html

EXPOSE 80

CMD ["nginx","-g","daemon off;"]