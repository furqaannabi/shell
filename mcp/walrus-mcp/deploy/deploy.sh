#!/usr/bin/env bash
# Deploy the Walrus MCP server on the EC2 host.
#
# Idempotent — re-running upgrades the install in place.
#
# Prereqs on the host (Amazon Linux 2023):
#   - Node.js + npm (`sudo dnf install -y nodejs`)
#   - nginx + certbot already set up for sui.furqaannabi.com
#   - tarball /tmp/walrus-mcp.tar.gz uploaded (or this repo cloned)
#
# Usage:
#   bash deploy.sh
#
# Optional env to enable signed-tx + MemWal tools:
#   WALRUS_KEYPAIR_PATH=/path/to/suiprivkey  bash deploy.sh
#   MEMWAL_DELEGATE_KEY=... MEMWAL_ACCOUNT_ID=... MEMWAL_SERVER_URL=...  bash deploy.sh

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/walrus-mcp}"
TARBALL="${TARBALL:-/tmp/walrus-mcp.tar.gz}"
UNIT_SRC="${UNIT_SRC:-$APP_DIR/deploy/walrus-mcp.service}"
NGINX_SNIPPET="${NGINX_SNIPPET:-$APP_DIR/deploy/nginx-mcp-location.conf}"
NGINX_VHOST="${NGINX_VHOST:-/etc/nginx/conf.d/sui.furqaannabi.com.conf}"
ENV_FILE="${ENV_FILE:-/etc/walrus-mcp.env}"

echo "==> Extracting source tarball (if present)"
mkdir -p "$APP_DIR"
if [[ -f "$TARBALL" ]]; then
    tar -xzf "$TARBALL" -C "$APP_DIR"
fi

echo "==> npm install + build"
cd "$APP_DIR"
npm install --engine-strict=false
npm run build

echo "==> Writing /etc/walrus-mcp.env (if env vars provided)"
{
    [[ -n "${WALRUS_KEYPAIR_PATH:-}" ]] && echo "WALRUS_KEYPAIR_PATH=$WALRUS_KEYPAIR_PATH"
    [[ -n "${WALRUS_CONTEXT:-}" ]] && echo "WALRUS_CONTEXT=$WALRUS_CONTEXT"
    [[ -n "${MEMWAL_DELEGATE_KEY:-}" ]] && echo "MEMWAL_DELEGATE_KEY=$MEMWAL_DELEGATE_KEY"
    [[ -n "${MEMWAL_ACCOUNT_ID:-}" ]] && echo "MEMWAL_ACCOUNT_ID=$MEMWAL_ACCOUNT_ID"
    [[ -n "${MEMWAL_SERVER_URL:-}" ]] && echo "MEMWAL_SERVER_URL=$MEMWAL_SERVER_URL"
    [[ -n "${MEMWAL_NAMESPACE:-}" ]] && echo "MEMWAL_NAMESPACE=$MEMWAL_NAMESPACE"
} | sudo tee "$ENV_FILE" > /dev/null
sudo chmod 600 "$ENV_FILE"

echo "==> Installing systemd unit"
# Uncomment the EnvironmentFile= line in the unit on install so /etc/walrus-mcp.env is picked up.
sed 's|^# EnvironmentFile=|EnvironmentFile=|' "$UNIT_SRC" | sudo tee /etc/systemd/system/walrus-mcp.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable --now walrus-mcp.service

echo "==> Probing local HTTP"
sleep 2
curl -sS --max-time 5 http://127.0.0.1:3030/health | head -c 400 || true
echo

echo "==> nginx: inject /mcp location if not present"
if ! sudo grep -q "location /mcp" "$NGINX_VHOST"; then
    # Insert the snippet just before the last '}' in the 443 server block.
    sudo cp "$NGINX_VHOST" "${NGINX_VHOST}.bak"
    sudo python3 - "$NGINX_VHOST" "$NGINX_SNIPPET" <<'PY'
import sys
vhost, snippet = sys.argv[1], sys.argv[2]
with open(vhost) as f: src = f.read()
with open(snippet) as f: snip = f.read()
# Find the closing '}' of the first server block that contains "listen 443"
i = src.find("listen 443")
if i < 0: raise SystemExit("listen 443 not found in vhost")
# Walk backwards to find the matching server { ... } close
depth = 0
end = -1
for j in range(i, len(src)):
    if src[j] == '{': depth += 1
    elif src[j] == '}':
        depth -= 1
        if depth == 0: end = j; break
if end < 0: raise SystemExit("could not find matching } for the 443 server block")
new = src[:end] + "\n    " + snip.replace("\n", "\n    ").rstrip() + "\n" + src[end:]
with open(vhost, "w") as f: f.write(new)
print("nginx vhost patched")
PY
fi

echo "==> nginx -t + reload"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Done. Verify with:"
echo "    curl -X POST https://sui.furqaannabi.com/mcp \\"
echo "         -H 'content-type: application/json' \\"
echo "         -H 'accept: application/json, text/event-stream' \\"
echo "         -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\",\"params\":{}}'"
echo "    curl http://127.0.0.1:3030/health           # local health probe"
echo "    sudo systemctl status walrus-mcp.service"
echo "    sudo journalctl -u walrus-mcp.service -n 50"
