#!/bin/sh
# Starts the API. Without JWT_SECRET, a random secret is generated on the first start and kept
# in a volume: the stack runs with no configuration at all, every installation gets its own
# secret, and issued tokens stay valid across restarts and image updates.
set -eu

if [ -z "${JWT_SECRET:-}" ]; then
  secret_file=/var/lib/todo-api/jwt-secret
  if [ ! -s "$secret_file" ]; then
    umask 077
    node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))" \
      > "$secret_file"
    echo "JWT_SECRET is not set: generated a random one in $secret_file" >&2
  fi
  JWT_SECRET=$(cat "$secret_file")
  export JWT_SECRET
fi

exec "$@"
