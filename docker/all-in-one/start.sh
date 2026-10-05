#!/bin/bash
# Runs MongoDB, the API and nginx side by side in one container. This is the image Docker
# Desktop's "Run" button can start on its own; docker-compose.yml runs the same parts as
# separate containers and remains the regular setup.
#
# The console (`docker logs`, the Logs tab in Docker Desktop) gets short status lines; MongoDB's
# verbose JSON log goes to /tmp/mongod.log and is printed only if the database fails to start.
set -euo pipefail

log() { echo "[todo] $*"; }
alive() {
  local pid
  for pid in "$@"; do kill -0 "$pid" 2>/dev/null || return 1; done
}
listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
healthy() {
  node -e "fetch('http://127.0.0.1:8080/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
}
# Stops whatever is running; then reports the failure (and the end of a log file, if given),
# unless the container is being stopped anyway.
fail() {
  kill -TERM $(jobs -p) 2>/dev/null || true
  wait || true
  if [ "$stopping" = true ]; then
    log "Stopped."
    exit 0
  fi
  log "$1"
  if [ -n "${2:-}" ]; then tail -n 20 "$2" >&2 || true; fi
  exit 1
}

export NODE_ENV=production
export PORT=3000
export MONGODB_URI=mongodb://127.0.0.1:27017/todo-app
# nginx in front of the API sets X-Forwarded-For.
export TRUST_PROXY=1
# Server errors only: a JSON line per request (or per wrong password) would bury the status
# lines. The separate containers of docker-compose.yml keep the full request log.
export LOG_LEVEL=error

# Docker stops the container with SIGTERM; tini passes it on. Stop all three processes then,
# and also when any of them exits on its own, so a crash does not leave a half-working app.
stopping=false
trap 'stopping=true; log "Stopping..."; kill -TERM $(jobs -p) 2>/dev/null || true' TERM INT

log "Starting MongoDB..."
# stdout too goes nowhere: mongod prints a line there before it switches to the log file.
mongod --dbpath /data/db --bind_ip 127.0.0.1 --logpath /tmp/mongod.log >/dev/null &
mongod_pid=$!
until listening 27017; do
  alive "$mongod_pid" || fail "MongoDB did not start. The end of its log:" /tmp/mongod.log
  sleep 0.5
done
log "MongoDB is ready."

log "Starting the API..."
# Generates the JWT secret on the first start (kept in a volume), then starts the API.
api-entrypoint node /app/apps/server/dist/index.js &
api_pid=$!
until listening 3000; do
  alive "$api_pid" || fail "The API did not start, see the messages above."
  sleep 0.5
done

log "Starting nginx..."
nginx -e stderr -g 'daemon off;' &
nginx_pid=$!

# Announce readiness once a request goes all the way through nginx, the API and MongoDB.
ready=false
for _ in $(seq 60); do
  if healthy; then
    ready=true
    break
  fi
  alive "$mongod_pid" "$api_pid" "$nginx_pid" || break
  sleep 1
done
if [ "$ready" = true ]; then
  log "Ready: web app on port 8080, mobile app (web build) on 8082, API on 4000."
  log "Open http://localhost:8080. Nothing there? Publish the ports: Host port 8080 (and 8082, 4000)"
  log "in Docker Desktop's Optional settings, or docker run -p 8080:8080 -p 8082:8082 -p 4000:4000."
elif alive "$mongod_pid" "$api_pid" "$nginx_pid"; then
  log "Still not ready after a minute; the messages above may explain why."
fi

status=0
wait -n || status=$?
kill -TERM $(jobs -p) 2>/dev/null || true
wait || true
# A requested stop is a clean exit (Docker Desktop shows anything else as a failure); a process
# that ended on its own is a failure even if it exited with 0.
if [ "$stopping" = true ]; then
  log "Stopped."
  exit 0
fi
log "A process stopped unexpectedly (exit code $status), so the container stops too."
exit $((status == 0 ? 1 : status))
