# Walrus tooling for LLM agents — MCP + skill design

This doc scopes how to expose Walrus to *LLM-driven* agents (Claude Code, Claude Desktop, Cursor, Continue, Goose) as a first-class capability, on top of the *Node-daemon* agent design in [`agent-mode.md`](agent-mode.md). The daemon and the LLM surface aren't substitutes — the daemon trades, the LLM operates over the daemon's Walrus state to summarise, explain, replay, and coordinate.

Track signal it targets: Sui Overflow 2026 **Walrus track** — "persistent verifiable memory for agents", "tooling that makes it easier for developers to adopt Walrus or MemWal in agentic systems", "long-running workflows where agents track state over time".

## Surface area an agent can drive

Four concurrent Walrus surfaces, each with a different access model:

| Surface | Reach | Cost | Auth | Best fit |
| --- | --- | --- | --- | --- |
| CLI (`walrus` binary) — `store`, `read`, `info`, `blob-status`, `extend`, `delete`, `get-wal` | full | SUI + WAL | wallet file | local-IDE agents (Claude Code), one-shot scripts |
| Publisher / Aggregator HTTP — `PUT /v1/store?epochs=N` (publisher) + `GET /v1/{blob_id}` (aggregator) | mostly write + read | testnet publisher absorbs WAL (rate-limited); mainnet charges | none for reads; none for testnet publisher writes | zero-install MCP server, hosted runners |
| TypeScript SDK `@mysten/walrus` — `writeBlob`, `writeFiles`, `writeBlobFlow`, `readBlob`, `getFiles`, `WalrusClient`, quilts | full incl. multi-file quilts | SUI + WAL via signer | wallet keypair | Node daemons, Next.js API routes |
| MemWal SDK `@mysten-incubation/memwal` (+ `/manual`, `/ai`, `/oc-memwal`) — `remember`, `recall`, `restore`; delegate-key + namespace model | semantic memory only (encrypted blobs + index) | WAL covered by MemWal relayer until self-hosted | delegate key + accountId + server URL + namespace | LLM agents that want associative recall, not file-level access |

Two observations that shape the design:

- **MemWal is the agent-shaped layer Mysten has already shipped.** `remember()` / `recall()` / `restore()` are exactly the verbs the Walrus track problem statement names. Delegate keys mean the agent (not the human) is the actor on Walrus, with isolated namespaces.
- **The native SDK is file-shaped, not memory-shaped.** Quilts (`writeFiles`) bundle multiple files into one storage event — ideal for an agent dumping a journal-day-worth-of-entries as one transaction. `writeBlobFlow` separates the cheap *encode* step from the costly *register/certify* steps so agents can show progress and retry.

The blob roles already designed in [`agent-mode.md`](agent-mode.md) — `wallet`, `strategy_state`, `journal`, `config` plus a Sui head pointer — map cleanly onto **native SDK for the structured blobs + MemWal for semantic recall over the journal**. They compose, not substitute.

## Delivery shape A — Walrus MCP server

What it gives you: any MCP-aware client gets Walrus as native typed tools. Transport: stdio (and optionally HTTP for hosted use). Tool list — eight ops covering the four agent gestures (own state, look at someone else's state, manage lifecycle, share context):

```
walrus.put           { content_b64 | path, epochs, deletable }  -> { blob_id, sui_object_id, cost_wal }
walrus.get           { blob_id, inline? }                       -> { blob_id, size, sha256, preview_text, content_b64? }
walrus.status        { blob_id | sui_object_id }                -> { epochs_remaining, owner, registered_at }
walrus.extend        { sui_object_id, epochs_extended }         -> { new_expiry_epoch }
walrus.delete        { sui_object_id }                          -> { ok }
walrus.put_quilt     { files: [{ path, identifier, tags }],
                       epochs }                                 -> { quilt_id, file_ids }
walrus.list_owned    { address }                                -> { blob_objects: [...] }
walrus.head_pointer  { object_id }                              -> { latest_blob_id, version, prev_blob_id }
```

Thin memory layer wrapping MemWal so one server speaks both file and recall semantics:

```
memwal.remember      { text, namespace?, tags? }                -> { memory_id, job_id }
memwal.recall        { query, k, namespace? }                   -> [{ text, score, memory_id, blob_id }]
memwal.restore       { namespace }                              -> { restored_count }
```

Key design calls:

- **Signing is server-side.** The server holds a wallet file or a MemWal delegate key. The LLM never sees keys. Env: `WALRUS_KEYPAIR_PATH`, `WALRUS_CONTEXT=testnet|mainnet`, `MEMWAL_DELEGATE_KEY`, `MEMWAL_ACCOUNT_ID`, `MEMWAL_SERVER_URL`.
- **Large blobs return content addresses, not bytes.** `walrus.get` defaults to `{ blob_id, size, sha256, preview_text }`; inlines bytes only when `inline=true` and the blob is below a threshold (16 KB suggested). LLM context isn't the place to ship megabytes.
- **Tools are idempotent.** Walrus already content-addresses, so two `put`s of identical content yield the same `blob_id`. Agents can retry safely on transient errors.
- **One free read tool always works.** `walrus.get` against the public aggregator costs nothing — agents can browse on-chain Walrus state without ever needing keys.
- **Optional Seal integration.** `walrus.put_sealed { content_b64, policy_id, epochs }` and `walrus.get_sealed { blob_id, session }` wrap the existing Seal pattern from Shell's order envelopes so agent memories can be policy-gated. Out of scope for v1.

Prior art: Anthropic's reference filesystem MCP for transport shape; MemWal's `oc-memwal` plugin for the delegate-key wiring. Both live in [MemWal's GitHub](https://github.com/MystenLabs/MemWal) under `packages/`.

## Delivery shape B — `SKILL.md` for Claude Code

What it gives you: a markdown file Claude Code loads on demand; the body tells the model how to compose CLI calls. Lower ceiling than MCP (every action is a shell-out, no structured returns), but **zero install** beyond `walrus` and `sui` already in PATH.

Skeleton (intended path: `~/.claude/skills/walrus/SKILL.md` or `<project>/.claude/skills/walrus/SKILL.md`):

```markdown
---
name: walrus
description: Store, retrieve, and reason over data on Walrus (Sui decentralized storage). Use this skill when the user asks to "save to Walrus", "read a blob", "list my agent's memory", or wants persistent state that survives across sessions and machines.
---

# Calling Walrus from Claude Code

You have `walrus` and `sui` on PATH. `~/.config/walrus/client_config.yaml` is preconfigured for testnet.

## Store
`walrus store <path> --epochs <n> --context testnet`
Output gives a Blob ID (content address, used for reads) and a Sui Object ID (used for extend/delete).

## Read
`walrus read <blob-id> --out <path> --context testnet`

## Inspect
`walrus blob-status <blob-id>` and `walrus info`.

## The Sui head-pointer pattern (for agent state)
The agent owns a Sui object holding the *current* blob_id plus a version counter. To checkpoint:
1. `walrus store strategy_state.json --epochs 14 --context testnet`
2. Capture Blob ID and Sui Object ID.
3. `sui client call --function update_head --args <head_id> <new_blob_id> --gas-budget …`
   `update_head` asserts version == N and bumps to N+1; old blob_id is preserved as `prev_blob_id` so the journal stays walkable.

[continues with: extend, delete, quilt-a-day-of-journal, wrap a Seal envelope, what to do when WAL balance is low]
```

The skill's pitch is *agent learns the Walrus mental model and can call the CLI fluently*; the MCP server's pitch is *agent gets typed tools so it can't typo a flag*. Developer-facing demos: MCP wins. User-facing one-shot demos: SKILL.md wins.

## How Shell composes with each

Three concrete stories that directly satisfy the Walrus-track headlines:

1. **Multi-day session, replayed.** The Shell daemon writes a `journal` blob per day, linked via head pointer. An LLM agent (via MCP) walks the chain backwards: *"what trades did I make last week, what was the P&L curve, was there a drawdown on Tuesday?"* — long-term memory headline.
2. **Cross-agent context handoff.** Two Shell daemons, different namespaces, same operator. Agent A drops a `signal` blob (*"seeing buy pressure on SUI/USDC"*); Agent B polls the publisher and reacts. Shared layer = Walrus; channel = a Sui shared object the operator owns — multi-agent coordination headline.
3. **Artifact-driven workflow.** Operator asks Claude Desktop *"summarise the last 1000 journal entries and produce a Markdown report."* Claude pulls the head pointer, walks 7 daily quilts, deserialises, summarises, writes the summary back as a Walrus blob, updates a `reports/` head — artifact-driven workflow headline.

All three are *interface gaps* on top of the existing Shell blob roles in [`agent-mode.md`](agent-mode.md). The MCP server / SKILL.md is the layer that closes them.

## What shipped

Both surfaces are live as of [`9add692`](../skills/walrus/SKILL.md).

| File | Role | State |
| --- | --- | --- |
| [`mcp/walrus-mcp/src/server.ts`](../mcp/walrus-mcp/src/server.ts) | MCP stdio transport, 11 tools registered | ✅ |
| [`mcp/walrus-mcp/src/tools/put.ts`](../mcp/walrus-mcp/src/tools/put.ts) | `walrus.put` — publisher `PUT /v1/blobs` | ✅ live testnet |
| [`mcp/walrus-mcp/src/tools/get.ts`](../mcp/walrus-mcp/src/tools/get.ts) | `walrus.get` — aggregator `GET /v1/blobs/{id}` | ✅ live testnet |
| [`mcp/walrus-mcp/src/tools/status.ts`](../mcp/walrus-mcp/src/tools/status.ts) | `walrus.status` — aggregator HEAD | ✅ live testnet |
| [`mcp/walrus-mcp/src/tools/list_owned.ts`](../mcp/walrus-mcp/src/tools/list_owned.ts) | `walrus.list_owned` — Sui RPC paginated, filter on `::blob::Blob` | ✅ live testnet |
| [`mcp/walrus-mcp/src/tools/head_pointer.ts`](../mcp/walrus-mcp/src/tools/head_pointer.ts) | `walrus.head_pointer` — schema-agnostic Sui object read | ✅ live testnet |
| [`mcp/walrus-mcp/src/tools/extend.ts`](../mcp/walrus-mcp/src/tools/extend.ts) | `walrus.extend` — `WalrusClient.executeExtendBlobTransaction` | ✅ wired, needs `WALRUS_KEYPAIR_PATH` |
| [`mcp/walrus-mcp/src/tools/delete.ts`](../mcp/walrus-mcp/src/tools/delete.ts) | `walrus.delete` — `WalrusClient.executeDeleteBlobTransaction` | ✅ wired, needs key |
| [`mcp/walrus-mcp/src/tools/quilt.ts`](../mcp/walrus-mcp/src/tools/quilt.ts) | `walrus.put_quilt` — `WalrusClient.writeFiles` + `WalrusFile.from` | ✅ wired, needs key |
| [`mcp/walrus-mcp/src/tools/memwal.ts`](../mcp/walrus-mcp/src/tools/memwal.ts) | `memwal.remember / recall / restore` via `@mysten-incubation/memwal` | ✅ wired, needs delegate key |
| [`mcp/walrus-mcp/src/sui.ts`](../mcp/walrus-mcp/src/sui.ts) | Lazy SuiJsonRpcClient + WalrusClient + bech32 keypair loader | ✅ |
| [`mcp/walrus-mcp/README.md`](../mcp/walrus-mcp/README.md) | Install, env config table, tool reference | ✅ |
| [`skills/walrus/SKILL.md`](../skills/walrus/SKILL.md) | Zero-install Claude Code skill (CLI flow + head-pointer recipe) | ✅ |

Smoke-tested: tool introspection lists all 11; `put → get → status` round-trips a fresh nonce on testnet; `head_pointer` reads the live Shell `Enclave<SHELL>` Move fields; `list_owned` paginates; the five tools that need keys/delegate return structured `isError` payloads with the exact env vars / CLI to fix.

Wiring into Shell: the daemon's existing Walrus writes (per [`agent-mode.md`](agent-mode.md)) keep using the TS SDK directly. The MCP server is for the *operator-facing* LLM surface — reading and reasoning over the daemon's blob trail from inside Claude Desktop / Cursor / etc., with `memwal.recall` providing the semantic-search shortcut over the journal.

## Recommendation (retained from design phase)

**Ship both, MCP first.** The MCP server is the bigger track signal — the problem statement names "integrations and tooling that make it easier for developers to adopt Walrus or MemWal in agentic systems" verbatim — and the demo of typing *"show me what my Shell agent did yesterday"* into Claude Desktop and getting a real summary off Walrus is the money shot. SKILL.md is the zero-install fallback.

## References

- Walrus docs — https://docs.wal.app/
  - Getting started (CLI walk-through) — https://docs.wal.app/docs/getting-started
  - HTTP API — https://docs.wal.app/docs/http-api/storing-blobs
  - Public aggregators + publishers — https://docs.wal.app/docs/system-overview/public-aggregators-and-publishers
- Walrus TypeScript SDK — https://sdk.mystenlabs.com/walrus
- MemWal — https://docs.memwal.ai/ • repo https://github.com/MystenLabs/MemWal (sample apps, OpenClaw plugin, manual flow examples)
- Seal — https://seal-docs.wal.app/ (for the Seal-policy-gated variant of agent memory)
- Sui Stack Messaging — https://github.com/MystenLabs/sui-stack-messaging (Walrus + Seal reference for messaging)
- Model Context Protocol — https://modelcontextprotocol.io/
