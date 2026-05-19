# @shell-finance/walrus-mcp

Walrus + MemWal as MCP tools for LLM agents (Claude Desktop, Claude Code, Cursor).

Eleven tools: eight Walrus operations (`put`, `get`, `status`, `extend`, `delete`, `put_quilt`, `list_owned`, `head_pointer`) and three MemWal operations (`remember`, `recall`, `restore`). The first three (`put`, `get`, `status`) work out of the box against Walrus testnet's public publisher + aggregator with zero wallet wiring; the rest land incrementally as a Sui keypair / MemWal delegate are configured.

Design rationale + Shell composition stories: see [`../../docs/walrus-agent-tooling.md`](../../docs/walrus-agent-tooling.md).

## Install

```bash
cd mcp/walrus-mcp
npm install
npm run build
```

## Register with Claude Code / Claude Desktop

Claude Code:

```bash
claude mcp add walrus -- node $(pwd)/dist/server.js
```

Claude Desktop (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "walrus": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/walrus-mcp/dist/server.js"],
      "env": {
        "WALRUS_CONTEXT": "testnet"
      }
    }
  }
}
```

## Configuration

All env vars are optional; defaults target Walrus testnet's public endpoints.

| Variable | Default | Effect |
| --- | --- | --- |
| `WALRUS_CONTEXT` | `testnet` | `testnet` or `mainnet`; flips the default publisher + aggregator URLs. |
| `WALRUS_PUBLISHER` | `https://publisher.walrus-testnet.walrus.space` | Override the publisher endpoint. |
| `WALRUS_AGGREGATOR` | `https://aggregator.walrus-testnet.walrus.space` | Override the aggregator endpoint. |
| `WALRUS_KEYPAIR_PATH` | — | Path to a Sui keypair file; enables `walrus.extend`, `walrus.delete`, `walrus.put_quilt`, and signed head-pointer updates. |
| `MEMWAL_DELEGATE_KEY` | — | MemWal delegate key (hex). |
| `MEMWAL_ACCOUNT_ID` | — | MemWal account id from the Playground. |
| `MEMWAL_SERVER_URL` | — | MemWal relayer URL. |
| `MEMWAL_NAMESPACE` | `default` | Default namespace for `memwal.*` operations. |

## Tool reference

### Zero-config (work today)

- **`walrus.put`** — store bytes via the public publisher.
  Args: `content_text` xor `content_b64`, `epochs?`, `deletable?`.
  Returns: `{ blob_id, sui_object_id, end_epoch, size_bytes, aggregator_url }`.
- **`walrus.get`** — fetch via the public aggregator.
  Args: `blob_id`, `inline?`.
  Returns: `{ blob_id, size_bytes, sha256, preview_text, content_b64? }`.
- **`walrus.status`** — HEAD against the aggregator.
  Args: `blob_id`. Returns `{ resolvable, size_bytes?, blob_end_epoch?, ... }`.

### MemWal-backed (needs delegate key)

Generate a delegate key + account at https://app.memwal.com, set `MEMWAL_DELEGATE_KEY`, `MEMWAL_ACCOUNT_ID`, and (optionally) `MEMWAL_SERVER_URL` / `MEMWAL_NAMESPACE`.

- **`memwal.remember`** — server encrypts, uploads to Walrus, and indexes the text. Returns the accepted job_id by default; pass `wait=true` to block until the pipeline finishes and return the final `blob_id`.
  Args: `text`, `namespace?`, `wait?`. Returns `{ kind: "accepted" | "done", job_id, blob_id?, ... }`.
- **`memwal.recall`** — semantic search; server downloads + decrypts hits server-side and returns plaintext.
  Args: `query`, `k?` (1–50, default 5), `namespace?`. Returns `{ total, results: [{ blob_id, text, distance }] }`.
- **`memwal.restore`** — rebuild a namespace's index from its underlying Walrus blobs.
  Args: `namespace`, `limit?`. Returns `{ restored, skipped, total, namespace, owner }`.

### Stubbed (return `not_implemented` until wired)

- **`walrus.extend`** — needs `WALRUS_KEYPAIR_PATH`.
- **`walrus.delete`** — needs `WALRUS_KEYPAIR_PATH`.
- **`walrus.put_quilt`** — bundle multiple files; needs `WALRUS_KEYPAIR_PATH`.
- **`walrus.list_owned`** — Sui RPC walk; no signer needed but not wired yet.
- **`walrus.head_pointer`** — read a Sui head-pointer object.

## Smoke test

After `npm run build`:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/server.js
```

Should emit a JSON-RPC response listing all eleven tools.

For end-to-end against testnet:

```bash
# Drop a tiny blob, read it back, verify status.
node -e "
import('./dist/server.js').then(async () => {});
" # see tests/ (not yet written)
```

## License

MIT
