#!/usr/bin/env bash
# Installs or updates the API on an EC2 instance (Ubuntu 24.04 or Amazon Linux 2023, e.g. a
# t3.micro):
#
#   Node.js 24 + the Express API as the systemd service "todo-api", listening on 127.0.0.1:4000;
#   Caddy in front of it on ports 80/443, with a free HTTPS certificate for <ip>.sslip.io
#   (the Amplify site is served over HTTPS and browsers block calls to a plain-HTTP API).
#
# Secrets live in /etc/todo-api.env (root only), never in the repository. The first run creates
# that file with a random JWT_SECRET and stops so you can fill in MONGODB_URI and CORS_ORIGIN.
# Run it again after editing the file, and after every push to deploy the new code:
#
#   curl -fsSL https://raw.githubusercontent.com/offsya/todoListSenama/main/deploy/ec2/setup.sh | sudo bash
#
# Optional variables: REPO_URL, BRANCH (default main), API_DOMAIN (your own domain pointing at
# this instance instead of <ip>.sslip.io).
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/offsya/todoListSenama.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/todo
APP_USER=todo
ENV_FILE=/etc/todo-api.env
SERVICE=todo-api

log() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "Run as root: sudo bash setup.sh"
. /etc/os-release
case "${ID:-}" in
  ubuntu) DISTRO=ubuntu ;;
  amzn) DISTRO=amazon ;;
  *) fail "This script supports Ubuntu and Amazon Linux 2023 (found ${PRETTY_NAME:-unknown})." ;;
esac

case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 CADDY_ARCH=amd64 ;;
  aarch64) NODE_ARCH=arm64 CADDY_ARCH=arm64 ;;
  *) fail "Unsupported CPU architecture: $(uname -m)" ;;
esac

# Instance metadata (IMDSv2): the public address for the HTTPS host name, the region for S3.
imds() {
  local token
  token=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token \
    -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' 2>/dev/null) || return 1
  curl -fsS -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/$1" 2>/dev/null
}

# Official Node.js 24 build from nodejs.org, checked against its SHA-256. Linked into /usr/bin:
# sudo's PATH on Amazon Linux does not include /usr/local/bin.
install_node_tarball() {
  local dir=/usr/local/lib/nodejs tmp file sums
  tmp=$(mktemp -d)
  sums=$(curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt)
  file=$(echo "$sums" | awk -v arch="linux-$NODE_ARCH.tar.xz" '$2 ~ arch"$" { print $2 }')
  [ -n "$file" ] || fail "Cannot find the Node.js 24 download."
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$file" -o "$tmp/$file"
  (cd "$tmp" && echo "$sums" | grep " $file\$" | sha256sum -c --quiet -) || fail "Node.js checksum mismatch."
  rm -rf "$dir"
  mkdir -p "$dir"
  tar -xJf "$tmp/$file" -C "$dir" --strip-components=1
  ln -sf "$dir/bin/node" /usr/bin/node
  ln -sf "$dir/bin/npm" /usr/bin/npm
  ln -sf "$dir/bin/npx" /usr/bin/npx
  rm -rf "$tmp"
}

# Latest Caddy release from GitHub, checked against its SHA-512, run by systemd as user "caddy".
install_caddy_binary() {
  local tmp tag version file base
  tmp=$(mktemp -d)
  tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/caddyserver/caddy/releases/latest)
  tag=${tag##*/}
  version=${tag#v}
  file="caddy_${version}_linux_${CADDY_ARCH}.tar.gz"
  base="https://github.com/caddyserver/caddy/releases/download/$tag"
  curl -fsSL "$base/$file" -o "$tmp/$file"
  curl -fsSL "$base/caddy_${version}_checksums.txt" -o "$tmp/checksums.txt"
  (cd "$tmp" && grep " $file\$" checksums.txt | sha512sum -c --quiet -) || fail "Caddy checksum mismatch."
  tar -xzf "$tmp/$file" -C "$tmp" caddy
  install -m 755 "$tmp/caddy" /usr/bin/caddy
  rm -rf "$tmp"

  id caddy >/dev/null 2>&1 \
    || useradd --system --user-group --create-home --home-dir /var/lib/caddy \
      --shell /usr/sbin/nologin caddy
  mkdir -p /etc/caddy
  [ -f /etc/caddy/Caddyfile ] || echo ':80 { respond "OK" }' > /etc/caddy/Caddyfile
  # The unit Caddy publishes for its own packages.
  cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy
After=network.target network-online.target
Requires=network-online.target

[Service]
Type=notify
User=caddy
Group=caddy
ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile
ExecReload=/usr/bin/caddy reload --config /etc/caddy/Caddyfile --force
TimeoutStopSec=5s
LimitNOFILE=1048576
PrivateTmp=true
ProtectSystem=full
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now --quiet caddy
}

log "System packages ($PRETTY_NAME)"
if [ "$DISTRO" = ubuntu ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git curl ca-certificates gnupg debian-keyring debian-archive-keyring \
    apt-transport-https >/dev/null
else
  # curl is already there (curl-minimal); installing the full package would conflict with it.
  dnf install -y -q git tar xz gzip openssl util-linux >/dev/null
fi

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 24 ]; then
  log "Node.js 24"
  if [ "$DISTRO" = ubuntu ]; then
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash - >/dev/null
    apt-get install -y -qq nodejs >/dev/null
  else
    install_node_tarball
  fi
fi
echo "node $(node -v), npm $(npm -v)"

if ! command -v caddy >/dev/null; then
  log "Caddy (HTTPS reverse proxy)"
  if [ "$DISTRO" = ubuntu ]; then
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
      | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
      > /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg \
      /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
  else
    install_caddy_binary
  fi
fi

# npm needs more than the 1 GiB of a t3.micro while installing.
if ! swapon --show | grep -q .; then
  log "2 GiB swap file"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id "$APP_USER" >/dev/null 2>&1 \
  || useradd --system --create-home --home-dir /var/lib/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
as_app() { sudo -u "$APP_USER" -H "$@"; }

log "Code: $REPO_URL ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  as_app git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  as_app git -C "$APP_DIR" reset --quiet --hard "origin/$BRANCH"
else
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  as_app git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
echo "commit $(as_app git -C "$APP_DIR" log -1 --format='%h %s')"

log "Build the API"
# Only the API and the shared package: the web and mobile apps are not built here.
as_app bash -c "cd '$APP_DIR' \
  && npm ci --workspace=@todo/server --workspace=@todo/shared --include-workspace-root \
       --ignore-scripts --no-audit --no-fund --loglevel=error \
  && npm run build -w @todo/shared --silent \
  && npm run build -w @todo/server --silent"

PUBLIC_IP=$(imds public-ipv4 || true)
REGION=$(imds placement/region || true)
API_DOMAIN="${API_DOMAIN:-${PUBLIC_IP:+${PUBLIC_IP//./-}.sslip.io}}"
[ -n "$API_DOMAIN" ] || fail "No public IPv4 address found. Give the instance one (Elastic IP) or set API_DOMAIN."

if [ ! -f "$ENV_FILE" ]; then
  log "Create $ENV_FILE"
  umask 077
  cat > "$ENV_FILE" <<EOF
# Settings and secrets of the API. Readable by root only; systemd passes them to the service.
# After editing: sudo systemctl restart $SERVICE
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
# Caddy on the same machine is the one reverse proxy in front of the API.
TRUST_PROXY=1
LOG_LEVEL=info

# MongoDB Atlas connection string (Atlas: Connect → Drivers), with the database name, e.g.
# mongodb+srv://todo-api:<password>@cluster0.abcde.mongodb.net/todo-app?retryWrites=true&w=majority
MONGODB_URI=

# Generated on this machine, at least 32 characters.
JWT_SECRET=$(openssl rand -hex 32)
JWT_EXPIRES_IN=15m

# The Amplify site, e.g. https://main.d1a2b3c4d5e6f7.amplifyapp.com (comma-separated list).
CORS_ORIGIN=

# Private S3 bucket for attachments. The credentials come from the instance's IAM role.
S3_BUCKET=
AWS_REGION=${REGION}
EOF
  chmod 600 "$ENV_FILE"
fi

missing=$(grep -E '^(MONGODB_URI|CORS_ORIGIN|S3_BUCKET)=$' "$ENV_FILE" | cut -d= -f1 || true)
if grep -q '^MONGODB_URI=$' "$ENV_FILE"; then
  fail "Fill in $(echo $missing | sed 's/ /, /g') in $ENV_FILE (sudo nano $ENV_FILE), then run this script again."
fi
[ -z "$missing" ] || echo "Not set yet in $ENV_FILE: $missing (the API starts without them; see deploy/README.md)."

log "systemd service $SERVICE"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Todo API (Node.js + Express)
After=network-online.target
Wants=network-online.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR/apps/server
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) dist/index.js
Restart=always
RestartSec=3
# Hardening: the service only reads its code and talks to the network.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet $SERVICE
systemctl restart $SERVICE

log "Caddy for https://$API_DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
# Managed by deploy/ec2/setup.sh. HTTPS certificate from Let's Encrypt, renewed automatically.
$API_DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:4000
}
EOF
systemctl reload caddy || systemctl restart caddy

log "Health check"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4000/health >/dev/null 2>&1; then break; fi
  sleep 1
done
if ! curl -fsS http://127.0.0.1:4000/health; then
  journalctl -u $SERVICE -n 30 --no-pager
  fail "The API does not answer. The log is above (journalctl -u $SERVICE)."
fi
echo

cat <<EOF

The API is running.
  Public URL:  https://$API_DOMAIN   (the certificate can take a minute on the first run)
  Check:       curl https://$API_DOMAIN/health
  Logs:        journalctl -u $SERVICE -f
  Settings:    sudo nano $ENV_FILE && sudo systemctl restart $SERVICE
  Update:      run this script again after a push

Use https://$API_DOMAIN as VITE_API_URL in Amplify and EXPO_PUBLIC_API_URL in apps/mobile/.env.
EOF
