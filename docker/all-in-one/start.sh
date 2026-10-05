#!/bin/bash
# Runs MongoDB, the API and nginx side by side in one container. This is the image Docker
# Desktop's "Run" button can start on its own; docker-compose.yml runs the same parts as
# separate containers and remains the regular setup.
set -euo pipefail

export NODE_ENV=production
export PORT=3000
export MONGODB_URI=mongodb://127.0.0.1:27017/todo-app
# nginx in front of the API sets X-Forwarded-For.
export TRUST_PROXY=1

mongod --dbpath /data/db --bind_ip 127.0.0.1 --quiet &
mongod_pid=$!

# The API expects the database to accept connections when it starts.
until (exec 3<>/dev/tcp/127.0.0.1/27017) 2>/dev/null; do
  if ! kill -0 "$mongod_pid" 2>/dev/null; then
    echo "MongoDB did not start" >&2
    exit 1
  fi
  sleep 0.5
done

# Generates the JWT secret on the first start (kept in a volume), then starts the API.
api-entrypoint node /app/apps/server/dist/index.js &
nginx -e stderr -g 'daemon off;' &

# Docker stops the container with SIGTERM; tini passes it on. Stop all three processes then,
# and also when any of them exits on its own, so a crash does not leave a half-working app.
stopping=false
trap 'stopping=true; kill -TERM $(jobs -p) 2>/dev/null || true' TERM INT
status=0
wait -n || status=$?
kill -TERM $(jobs -p) 2>/dev/null || true
wait || true
# A requested stop is a clean exit (Docker Desktop shows anything else as a failure); a process
# that ended on its own is a failure even if it exited with 0.
if [ "$stopping" = true ]; then exit 0; fi
exit $((status == 0 ? 1 : status))
