FROM python:3.12.2-bookworm

ARG OSRM_BACKEND_URL="https://routing.radlnavi.de"
ENV OSRM_BACKEND_URL=${OSRM_BACKEND_URL}

RUN apt-get clean && apt-get update && \
    apt-get install -y libosmium-dev cmake

WORKDIR /opt/app

COPY poetry.lock poetry.lock
COPY poetry.toml poetry.toml
COPY pyproject.toml pyproject.toml
RUN pip install poetry
RUN poetry install

RUN mkdir geo

COPY src/geo_store.py src/geo_store.py

WORKDIR /opt/app/src
RUN wget https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf -O ../geo/oberbayern-latest.osm.pbf && \
    poetry run python geo_store.py && \
    rm ../geo/oberbayern-latest.osm.pbf

COPY src/app.py /opt/app/src/app.py

CMD [ "poetry", "run", "python", "-m", "uvicorn", "app:app", "--host=0.0.0.0" ]