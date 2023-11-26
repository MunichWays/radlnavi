FROM node:18.16-buster AS builder

ARG BACKEND_URL="https://routing.floschnell.de"
ARG VERSION="v1"

COPY public public
COPY src src
COPY load_munichways.mjs load_munichways.mjs
COPY package.json package.json
COPY package-lock.json package-lock.json
COPY tsconfig.json tsconfig.json

RUN npm install --verbose

RUN node load_munichways.mjs

RUN REACT_APP_OSRM_BACKEND="$BACKEND_URL" REACT_APP_VERSION="$VERSION" npm run build

FROM ubuntu/nginx

ENV PORT 80

COPY --from=builder build /var/www/html

EXPOSE 80

CMD ["nginx","-g","daemon off;"]