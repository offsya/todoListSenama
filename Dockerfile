# syntax=docker/dockerfile:1
#
# One Dockerfile for the whole monorepo; docker-compose.yml picks a target per service:
#   api         Node.js API (production dependencies only, runs as a non-root user)
#   web         React web app served by nginx, which also proxies /api to the API and
#               publishes the API on port 4000
#   mobile-web  Web build of the Expo app, served the same way
#   all-in-one  All of the above plus MongoDB in a single container, for Docker Desktop's
#               "Run" button (published as offsya/todolistsenamasoft:latest)

ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginx:1.29-alpine
ARG MONGO_IMAGE=mongo:8
# The all-in-one image: plain Ubuntu (the base of MongoDB's image, whose mongod it takes) and a
# glibc build of Node.js.
ARG UBUNTU_IMAGE=ubuntu:24.04
ARG NODE_GLIBC_IMAGE=node:24-bookworm-slim

# ---- Dependencies (cached until a manifest or the lock file changes) ----------------------
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/client/package.json packages/client/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/

FROM manifests AS deps
# --ignore-scripts: the root postinstall builds the internal packages, whose sources are not
# copied yet, and the API tests' MongoDB download has no place in an image. Native tools
# (rolldown, esbuild, lightningcss) ship as platform packages and need no install scripts.
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---- Internal packages ---------------------------------------------------------------------
FROM deps AS packages
COPY tsconfig.base.json ./
COPY packages packages
RUN npm run build:packages

# ---- API -----------------------------------------------------------------------------------
FROM packages AS api-build
COPY apps/server apps/server
RUN npm run build -w @todo/server

FROM manifests AS api-deps
# --omit=optional as well: --omit=dev keeps packages that the lock file also lists as optional
# dependencies of the apps' tooling (TypeScript, lightningcss binaries): 71 MB instead of 38 MB.
RUN npm ci --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund \
    --workspace @todo/server \
  && mkdir -p apps/server/node_modules

FROM ${NODE_IMAGE} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deps /app/node_modules node_modules
COPY --from=api-deps /app/apps/server/node_modules apps/server/node_modules
COPY packages/shared/package.json packages/shared/
COPY --from=packages /app/packages/shared/dist packages/shared/dist
COPY apps/server/package.json apps/server/
COPY --from=api-build /app/apps/server/dist apps/server/dist
COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
# Holds the JWT secret generated when none is configured; compose mounts a volume here.
RUN mkdir -p /var/lib/todo-api && chown node:node /var/lib/todo-api
USER node
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["api-entrypoint"]
CMD ["node", "apps/server/dist/index.js"]

# ---- nginx for the single-page apps --------------------------------------------------------
FROM ${NGINX_IMAGE} AS spa
COPY docker/nginx/spa.conf /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

# ---- Web -----------------------------------------------------------------------------------
FROM packages AS web-build
COPY apps/web apps/web
RUN npm run build -w @todo/web

FROM spa AS web
COPY docker/nginx/csp-web.conf /etc/nginx/csp.conf
COPY docker/nginx/api-gateway.conf /etc/nginx/conf.d/api-gateway.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 4000

# ---- Mobile app, web build -----------------------------------------------------------------
FROM packages AS mobile-web-build
COPY apps/mobile apps/mobile
# Same origin as the page: the bundled nginx forwards /api to the API.
ENV EXPO_PUBLIC_API_URL=/api CI=1
RUN cd apps/mobile && npx expo export --platform web --output-dir dist-web

FROM spa AS mobile-web
COPY docker/nginx/csp-mobile-web.conf /etc/nginx/csp.conf
COPY --from=mobile-web-build /app/apps/mobile/dist-web /usr/share/nginx/html

# ---- Everything in one container -----------------------------------------------------------
# Docker Desktop's "Run" button starts a single image, so this one runs MongoDB, the API and
# nginx side by side under tini (docker/all-in-one/start.sh). One process per container, as in
# docker-compose.yml, stays the regular setup; this image exists for a no-terminal start.
FROM ${NODE_GLIBC_IMAGE} AS node-glibc
FROM ${MONGO_IMAGE} AS mongo

# Plain Ubuntu rather than the MongoDB image: that one also ships mongosh, mongos and the
# database tools (1.4 GB instead of about 450 MB) and declares port 27017, which Docker Desktop
# would offer to publish next to the app's ports.
FROM ${UBUNTU_IMAGE} AS all-in-one
# libcurl brings everything else mongod links against (OpenSSL, Kerberos, LDAP, ...).
RUN apt-get update \
  && apt-get install -y --no-install-recommends nginx tini libcurl4t64 \
  && rm -rf /var/lib/apt/lists/* /etc/nginx/sites-enabled /etc/nginx/conf.d \
  && useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin todo
COPY --from=mongo /usr/bin/mongod /usr/bin/mongod
COPY --from=node-glibc /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
# The API's dependencies are plain JavaScript (no native addons), so the Alpine install works.
COPY --from=api-deps /app/node_modules node_modules
COPY --from=api-deps /app/apps/server/node_modules apps/server/node_modules
COPY packages/shared/package.json packages/shared/
COPY --from=packages /app/packages/shared/dist packages/shared/dist
COPY apps/server/package.json apps/server/
COPY --from=api-build /app/apps/server/dist apps/server/dist
COPY --from=web-build /app/apps/web/dist /srv/web
COPY --from=mobile-web-build /app/apps/mobile/dist-web /srv/mobile-web
COPY docker/all-in-one/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/csp-web.conf docker/nginx/csp-mobile-web.conf /etc/nginx/
COPY --chmod=755 docker/api-entrypoint.sh /usr/local/bin/api-entrypoint
COPY --chmod=755 docker/all-in-one/start.sh /usr/local/bin/start-todo
# Data lives in volumes: the database and the generated JWT secret.
RUN mkdir -p /data/db /var/lib/todo-api && chown todo:todo /data/db /var/lib/todo-api
VOLUME ["/data/db", "/var/lib/todo-api"]
USER todo
# 8080 web app, 8082 mobile app (web build), 4000 API for the mobile app on a phone.
EXPOSE 8080 8082 4000
# Checked every 2 s while starting, so Docker Desktop shows "healthy" as soon as the app is up.
HEALTHCHECK --interval=10s --timeout=3s --start-period=60s --start-interval=2s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
ENTRYPOINT ["tini", "--", "start-todo"]
