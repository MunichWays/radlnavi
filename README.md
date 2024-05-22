# radlnavi.de

This project has the code basis for frontend and backend of radlnavi.de. A webpage for regional bike navigation in and around Munich. The routing algorithm takes into account the `class:bicycle` information given by OpenStreetMap and navigates preferably via good rated route segments.

Routing is done via the [backend service](./backend/) and uses the rules and speeds given in the [bike.lua](./routing/bike.lua) file.

The [frontend service](./frontend/) interacts with the user and also features an overlay of the different route segments that have been annotated with `class:bicycle`. Therefor, the script [load_munichways.mjs](./frontend/load_munichways.mjs) needs to be executed, while development or eventually, when a new version of the frontend is build via docker.

# Development

You need to have Docker setup on your system and all the given tooling has only been tested on a Ubuntu/Linux system.

To test the frontend only, use `npm run start` from the frontend folder. When you want to test a new frontend together with backend/routing changes, then use the [build_and_run_locally.sh](./build_and_run_locally.sh). This command will build new frontend and backend images and spin them up in new containers. Access the frontend via `https://localhost:9966`.

# Release

Each service (frontend and backend) have their own `build.sh` script that builds the respective docker container. The full system can be build via the [root build.sh](./build.sh) script. Since currently the webpage is hosted via Google's Cloud Run service, whenever new images are built, these need to be pushed to the Cloud Run registry and deployed via the Google Cloud Console.
