#!/bin/sh
# Starts the Expo dev server for Expo Go. The QR code and the bundle URLs carry
# REACT_NATIVE_PACKAGER_HOSTNAME, the computer's address in the local network: the container's
# own address is unreachable from a phone. The app then calls the API on port 4000 of the same
# computer, published by the web container of the stack.
set -eu

if [ -z "${REACT_NATIVE_PACKAGER_HOSTNAME:-}" ]; then
  cat >&2 <<'EOF'
[expo] REACT_NATIVE_PACKAGER_HOSTNAME is not set: the QR code will point at the container,
[expo] which a phone cannot reach. Pass this computer's LAN address, for example
[expo]   docker run -it --rm -p 8081:8081 -e REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.10 offsya/todolistsenamasoft:expo
[expo] (on Windows scripts/start-expo.bat finds the address itself).
EOF
fi

exec npx expo start --lan --port 8081 "$@"
