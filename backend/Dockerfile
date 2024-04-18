FROM python:3.12.2-bookworm

RUN apt-get clean && apt-get update && \
    apt-get install -y libosmium-dev cmake

WORKDIR /opt/app

COPY poetry.lock poetry.lock
COPY poetry.toml poetry.toml
COPY pyproject.toml pyproject.toml
RUN pip install poetry
RUN poetry install

RUN mkdir geo
RUN wget https://download.geofabrik.de/europe/germany/bayern/oberbayern-latest.osm.pbf -O ./geo/oberbayern-latest.osm.pbf

COPY src src

WORKDIR /opt/app/src
CMD [ "poetry", "run", "python", "-m", "uvicorn", "app:app", "--host=0.0.0.0" ]