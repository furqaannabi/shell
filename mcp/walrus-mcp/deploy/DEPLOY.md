# Deploy walrus-mcp on EC2 (sui.furqaannabi.com/mcp)

End-to-end runbook to bring the Streamable-HTTP variant of the Walrus MCP server up on the existing EC2 host fronting `sui.furqaannabi.com`. The local dev / stdio path (`claude mcp add walrus -- node dist/server.js`) is unchanged.

## Layout

| File | Role |
| --- | --- |
| `deploy.sh` | Top-level installer. Idempotent. |
| `walrus-mcp.service` | systemd unit. Runs `node dist/server-http.js` as `ec2-user`. Hardened (`ProtectSystem=strict`). |
| `nginx-mcp-location.conf` | Drop-in `location /mcp` block for the existing 443 server in `/etc/nginx/conf.d/sui.furqaannabi.com.conf`. |

## One-shot from a workstation with SSH access

```bash
# 1. Build + package the source locally
cd mcp/walrus-mcp
npm install && npm run build
tar --exclude=node_modules --exclude=dist \
    -czf /tmp/walrus-mcp.tar.gz \
    package.json package-lock.json tsconfig.json README.md src/ deploy/

# 2. Ship to the host
scp -i ~/.ssh/<key>.pem /tmp/walrus-mcp.tar.gz ec2-user@sui.furqaannabi.com:/tmp/

# 3. Run the installer on the host
ssh -i ~/.ssh/<key>.pem ec2-user@sui.furqaannabi.com \
    'mkdir -p ~/walrus-mcp && tar -xzf /tmp/walrus-mcp.tar.gz -C ~/walrus-mcp && bash ~/walrus-mcp/deploy/deploy.sh'
```

The installer:

1. Extracts the tarball if `/tmp/walrus-mcp.tar.gz` is present.
2. `npm install` + `npm run build`.
3. Writes `/etc/walrus-mcp.env` with any of `WALRUS_KEYPAIR_PATH`, `MEMWAL_DELEGATE_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_SERVER_URL`, `MEMWAL_NAMESPACE` you exported before invoking it.
4. Installs `/etc/systemd/system/walrus-mcp.service`, enables + starts it.
5. Probes `http://127.0.0.1:3030/health` and prints the response.
6. Patches `/etc/nginx/conf.d/sui.furqaannabi.com.conf` by injecting the `/mcp` location block before the closing `}` of the 443 `server` block (backs up to `*.bak` first).
7. `nginx -t` + `systemctl reload nginx`.

## Verification

```bash
# Locally on the host:
curl http://127.0.0.1:3030/health
sudo systemctl status walrus-mcp.service
sudo journalctl -u walrus-mcp.service -n 50

# Publicly:
curl -X POST https://sui.furqaannabi.com/mcp \
     -H 'content-type: application/json' \
     -H 'accept: application/json, text/event-stream' \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

The MCP initialize should return an SSE-formatted `event: message\ndata: {…}` body with `serverInfo.name = "walrus-mcp"`.

## Enabling signed-tx + MemWal tools

The three Walrus signed tools (`extend`, `delete`, `put_quilt`) and the three MemWal tools require credentials. Set the env vars before running `deploy.sh` (the installer writes them into `/etc/walrus-mcp.env`):

```bash
export WALRUS_KEYPAIR_PATH=/etc/walrus-mcp.suiprivkey   # file holding a `suiprivkey1...` bech32 string
export MEMWAL_DELEGATE_KEY=...                           # from https://app.memwal.com
export MEMWAL_ACCOUNT_ID=...
export MEMWAL_SERVER_URL=https://relayer.memwal.ai
export MEMWAL_NAMESPACE=shell
bash ~/walrus-mcp/deploy/deploy.sh
```

To rotate after-the-fact: edit `/etc/walrus-mcp.env`, then `sudo systemctl restart walrus-mcp`.

## Connecting Claude Desktop / Claude Code to the public endpoint

```json
{
  "mcpServers": {
    "walrus": {
      "url": "https://sui.furqaannabi.com/mcp",
      "transport": "streamable-http"
    }
  }
}
```

For Claude Code CLI:

```bash
claude mcp add walrus --transport http https://sui.furqaannabi.com/mcp
```

## Rollback

```bash
sudo systemctl disable --now walrus-mcp.service
sudo rm /etc/systemd/system/walrus-mcp.service
sudo mv /etc/nginx/conf.d/sui.furqaannabi.com.conf.bak /etc/nginx/conf.d/sui.furqaannabi.com.conf
sudo nginx -t && sudo systemctl reload nginx
```

`~/walrus-mcp` and `/etc/walrus-mcp.env` are left in place for re-install.
