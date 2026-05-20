---
name: walrus
description: Store, retrieve, list, and reason over data on Walrus — Sui's decentralized storage protocol. Use this skill when the user asks to "save to Walrus", "read a blob", "list my agent's memory", "extend a blob", or wants persistent state that survives sessions/machines. Also covers the Sui head-pointer pattern for agent state that evolves over time.
---

# Walrus from Claude Code

Walrus is content-addressed decentralized storage on Sui. Bytes are written into blobs identified by a `blob_id` (deterministic hash of the content). The blob's lifecycle (epochs of storage, extend, delete) is tracked by a Sui object whose `sui_object_id` is the per-write handle. Two surfaces matter here:

- the **`walrus` CLI** for full-feature access (extend, delete, quilts, blob status)
- the **public HTTP publisher/aggregator** for zero-install reads and write through Mysten's hosted endpoints (testnet only — no WAL needed)

If a Walrus MCP server is already installed (see [`mcp/walrus-mcp/`](../../mcp/walrus-mcp/)), prefer its typed tools (`walrus.put`, `walrus.get`, `walrus.status`, `walrus.list_owned`, `walrus.head_pointer`, `walrus.extend`, `walrus.delete`, `walrus.put_quilt`) over shelling out. The CLI flow below is the fallback when the MCP server isn't registered.

## Prerequisites

The CLI needs Walrus + a configured Sui client. On Amazon Linux / macOS / Linux:

```sh
curl -sSf https://install.wal.app | sh -s -- -n testnet           # testnet binary
curl --create-dirs https://docs.wal.app/setup/client_config.yaml \
  -o ~/.config/walrus/client_config.yaml                          # one-shot config
sui client                                                        # answer prompts to bind testnet
walrus info                                                       # verify; output should say "Epoch duration: 1day"
```

Windows (PowerShell): `$env:WALRUS_NETWORK="testnet"; iwr https://install.wal.app/install.ps1 -useb | iex` (the binary lands at `$env:LOCALAPPDATA\walrus`; add to PATH).

For storage writes, fund the active Sui address: faucet at <https://faucet.sui.io/> for SUI, then `walrus get-wal --context testnet` to swap SUI→WAL.

## Common operations

### Store a blob

```sh
walrus store ./agent_state.json --epochs 14 --context testnet
```

The output lists both ids. Capture them — semantics differ:

- **Blob ID** (base64ish) — *the address of the bytes*. Use for reads, anyone can resolve it.
- **Sui Object ID** (`0x...`) — *the handle on the lifecycle*. Use for extend, delete, transfer.

### Read a blob

```sh
walrus read <blob-id> --out /tmp/restored.json --context testnet
```

Free, no wallet needed. Any blob_id resolves through any aggregator that has the slivers cached.

### Status

```sh
walrus blob-status <blob-id> --context testnet
```

Tells you epoch + storage-node coverage. Always check before relying on a blob you don't own — testnet epochs are 1 day and unfunded blobs roll off.

### Extend storage duration

```sh
walrus extend --blob-obj-id <sui-object-id> --epochs-extended 7 --context testnet
```

Sui object id, not blob id. Costs WAL per epoch.

### Delete (deletable blobs only)

```sh
walrus delete --blob-id <blob-id> --context testnet
```

Only works if the original `walrus store` set `--deletable`. Doesn't purge aggregator caches — Walrus is content-addressed, not recallable. Treat any blob you ever published as effectively permanent.

### Zero-install read (no CLI needed)

Skip the install if you only need to read:

```sh
curl https://aggregator.walrus-testnet.walrus.space/v1/blobs/<blob-id>
```

Returns the raw bytes. Mainnet aggregator: `https://aggregator.walrus.space/v1/blobs/<blob-id>`.

### Zero-install write (testnet only)

Mysten runs a public publisher on testnet that absorbs WAL:

```sh
curl -X PUT \
  "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=2" \
  -d @./agent_state.json
```

Mainnet publishers charge — don't expect free writes there.

## The Sui head-pointer pattern (agent state that evolves)

Walrus blobs are immutable. To track an agent's *current* state across rewrites, pair each new blob with a single Sui object that holds the latest `blob_id` and a `version` counter. This is the design behind Shell's agent mode — see [`docs/agent-mode.md`](../../docs/agent-mode.md) for the full spec.

```
       walrus blobs (immutable)             Sui head object (mutable)
       ───────────────────────              ─────────────────────────
       blob_v3 ←─ prev ─┐
       blob_v2 ←─ prev ─┘                    Head { latest: blob_v3, version: 3, prev: blob_v2 }
       blob_v1                              ▲ updated atomically per write
```

Checkpoint flow:

1. `walrus store new_state.json --epochs 14 --context testnet` → returns `<blob-id-N>` + `<sui-obj-N>`.
2. Read the head object to learn the current version. From Claude Code, that's
   ```sh
   sui client object <HEAD_ID> --json
   ```
   and inspect `.content.fields.version` + `.content.fields.latest_blob`.
3. Submit a PTB that asserts `version == N` and bumps to `N+1`, setting `latest_blob = <blob-id-N>` and `prev_blob_id = <previous blob_id>`. Concrete Move call depends on your head object's module — for Shell agents the function is `shell_agent::Head::update` (not yet shipped on-chain; see agent-mode.md for the planned shape).
4. Future agents resume by reading the head, fetching the blob, and replaying the linked-list backward as far as they care to.

The Walrus MCP server's `walrus.head_pointer` tool does step 2 in a single call; step 3 is the only one that strictly needs a Sui keypair.

## When NOT to use Walrus

- **Frequently mutating data** — checkpoint snapshots are fine; per-keystroke writes are not. Each store costs WAL + emits a Sui tx.
- **Secrets in plaintext** — Walrus blobs are *public*. Encrypt with Seal under a Move-policy gate before storing anything sensitive.
- **Sub-second reads** — aggregators are fast but not in-memory-cache fast. Cache locally if a tight loop reads the same blob.
- **Anything you might want to retract** — see "Delete" above. Treat published blobs as permanent.

## When to surface this skill

Trigger keywords that should pull this skill in: "walrus", "blob_id", "store on walrus", "persistent agent state", "memwal", "decentralized storage", "agent memory across sessions". Don't surface for generic file-I/O — Walrus is the right answer when persistence across sessions / agents / machines matters, not when a local `~/.cache/foo` would suffice.
