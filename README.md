# Shell Finance

> Cryptographically trust-minimized institutional execution. Move enforces the rules, Seal + Nautilus enforce the privacy, the hot-potato `MatchInstruction` enforces atomic on-chain settlement — the composition exists nowhere else on-chain.

![Shell Finance architecture](https://raw.githubusercontent.com/furqaannabi/shell/main/assets/architecture.png)

Hackathon build for Sui Overflow 2026 — **DeFi & Payments** track, Trust-Minimized Finance slot.

**Live on testnet:**

- Web app — <https://shell-finance.vercel.app/>
- Walrus + MemWal MCP (Streamable HTTP) — `POST https://sui.furqaannabi.com/mcp` ([runbook](mcp/walrus-mcp/deploy/DEPLOY.md))
- Nitro enclave HTTP surface — <https://sui.furqaannabi.com/>
- Walrus skill (markdown) — <https://shell-finance.vercel.app/skills.md>

## Problem

Every public order book on-chain exposes order intent before execution. For retail flow that's acceptable; for institutional size it's an execution tax: searchers front-run, market makers fade quotes, and large orders can't be worked without significant slippage. Existing on-chain attempts at hiding flow are each partial:

- **Stealth-address payments** (PIVY, Umbra) hide recipients but not order flow.
- **Privacy AMMs** (Shroud, Penumbra) hide swaps but pay AMM-curve slippage and can't serve institutional size.
- **ZK rollups** (Aztec, Aleo) provide privacy but lose access to the host chain's deepest liquidity.
- **Off-chain dark pools** (sFOX, ErisX) require trusting a single operator and lack on-chain settlement guarantees.

An institutional venue needs four properties at once: pre-trade order privacy, post-trade auditability, atomic on-chain settlement, and zero operator trust. No chain previously had the primitives to deliver all four.

## Solution

Shell composes three Sui-native primitives — and nothing else does it:

| Layer    | What it enforces                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| **Seal**       | Threshold IBE seals each order envelope. Decryption only fires when an on-chain Move policy says yes.              |
| **Nautilus**   | The matching engine runs in an AWS Nitro Enclave. The binary is PCR-pinned on-chain — the operator can't tamper.   |
| **Settlement** | The signed `MatchInstruction` is a hot-potato — it must be consumed in the same PTB that crosses both `OrderCommitment`s and mints a `SettlementReceipt` per side. Settle-or-revert is enforced at the Move type level. |

Pre-match the chain sees only ciphertext + a commit hash. Post-settlement the chain shows a `SettlementReceipt` per side and the swapped balances. Side, size, limit price, and slippage from the original order stay private forever.

The threat-model honesty: there is an irreducible trust set (Sui consensus + Seal key-server quorum + AWS Nitro hardware), and we don't hide it.

## User flow

1. **Connect wallet** — dapp-kit, Sui Wallet / Suiet / etc.
2. **Place a sealed order** — pick side / size / limit / expiry / slippage. The SDK Seal-IBE-encrypts the BCS plaintext under a random per-order id, builds a PTB calling `shell::pool::submit_order`, the wallet signs. On-chain: a shared `OrderCommitment` lands with the sealed envelope as opaque bytes.
3. **See it in active orders** — the row shows a commit-hash fingerprint, `SEALED` status. Cancel works after expiry.
4. **Match (invisible)** — the Nautilus enclave decrypts plaintexts in-TEE, runs price-time matching, signs an `IntentMessage<MatchPayloadV2>` envelope (includes `base_decimals` for correct per-pair scaling). A settlement PTB lands: `shell::attestation::verify_v2` produces a `MatchInstructionV2` hot-potato, `shell::settlement::settle_v4` consumes it atomically with both orders, crosses collateral directly between maker and taker.
5. **Fee split** — `settle_v4` deducts a flat 0.1% protocol fee from both sides (10 bps each, 20 bps round-trip), paid in the pair's quote coin (`TQuote` of whatever pair settled — USDC, DBUSDC, SUI, etc.). The rate is pool-wide and pair-agnostic: settlement Move is generic over `<TBase, TQuote>` and the fee math uses signed `base_decimals` from `MatchPayloadV2`, so adding new pairs (BTC, ETH, RWAs) does not change the model. Fee flows to the on-chain treasury address in `Pool` (treasury wallet accumulates mixed `Coin<T>` types — one bucket per quote currency traded). Buyer pre-deposits `trade_value + fee`; price-improvement surplus is refunded to the buyer. Per-pair fee tiers (e.g. RWA compliance premium, majors race-to-zero) are a post-hackathon governance question.
6. **See the receipt** — a `SettlementReceipt` per side appears under the trader's address, and the wallet shows the swapped coin balance. The trader's original limit price + slippage are never revealed on-chain.

## Status

**Autonomous Seal-in-Nitro loop running on testnet.** The enclave watches Sui for `OrderSubmitted` events, fetches each `OrderCommitment` ciphertext, requests Seal key shares (gated by `shell::shell::seal_approve`), decrypts inside the TEE, runs price-time matching, builds + signs a real `sui_sdk_types::Transaction`, and submits the settlement PTB itself — no trader, host, or operator in the signing path. The enclave's signing identity is derived from a host-managed seed (`ENCLAVE_KEY_SEED`) so the on-chain `Enclave<SHELL>` registration survives reboots.

| Layer    | What works                                                                              | Where                                                            |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Move     | Pool + OrderCommitment + Receipt; hot-potato MatchInstruction; seal_approve; `ioi` module; `settle_v4<TBase,TQuote>` with 0.1% protocol fee + price-improvement refund + per-pair `base_decimals` scaling + self-match prevention (`ESelfMatch`); `verify_v2` / `MatchInstructionV2` / `MatchPayloadV2`; 9/9 tests | [`move/`](move/)                                                 |
| Move     | Latest upgrade at `0x275cf497…` (adds `settle_v4` + `ESelfMatch` self-match prevention on top of fee + RWA scaling) | [`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) |
| Enclave  | Autonomous order-poller + IOI-matcher; calls `verify_v2` + `settle_v4`; derives `base_decimals` per asset (9 for SUI, 6 for other); bootstrap-seeds book from chain on cold start | [`enclave-nitro/apps/shell/mod.rs`](enclave-nitro/apps/shell/mod.rs) |
| Nitro    | **Prod-mode** `Enclave<SHELL>` `0xd002490d…`, PCR0/1 `0x3f5e13c4…`, persistent eph_kp via host seed | running on `m5.xlarge` at `https://sui.furqaannabi.com`         |
| RWA      | Auto-discovered pair universe from DeepBook indexer + Pyth Hermes registry — every Sui coin with a live DeepBook pool or Pyth feed is selectable in a Uniswap-style search (name or paste `0x…::module::TYPE`). Static slots for TBILL (testnet mock), USDY, BUIDL still ship as overrides. Tokens without a price source are surfaced but disabled (cannot match — fairness constraint). | [`web/src/lib/sui.ts`](web/src/lib/sui.ts), [`web/src/app/api/pairs/route.ts`](web/src/app/api/pairs/route.ts), [`shell-agent/src/pairs.ts`](shell-agent/src/pairs.ts) |
| SDK      | `encryptOrder` (Seal IBE) + `submitOrderTx` (PTB builder)                               | [`ts-sdk/`](ts-sdk/)                                             |
| Demo     | E2E retest 2026-05-24 ~3 min total: IOI → match → accept → settle_direct → SettlementReceipts ([`2b96TNRe…`](https://suiscan.xyz/testnet/tx/2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig)) | Testnet |
| Web      | Connect wallet, place sealed order, view receipts — all on testnet                     | <https://shell-finance.vercel.app/> ([source](web/))             |
| shell-agent | Autonomous Node daemon (v2): pluggable LLM (OpenAI / Anthropic / Google / any OpenAI-compatible), bounded tool-use loop, 9 built-in trading tools, local plugin loader, MCP client. E2E demo runs end-to-end with tool calls visible in logs. | [`shell-agent/`](shell-agent/) |
| Agents   | Walrus + MemWal MCP server (11 typed tools); stdio for local + Streamable HTTP at `https://sui.furqaannabi.com/mcp` | [`mcp/walrus-mcp/`](mcp/walrus-mcp/), [`skills/walrus/`](skills/walrus/) |
| Liveness | `GET /shell/status` returns task-tick timestamps + book sizes; external monitoring can alert on stale ticks | [`enclave-nitro/apps/shell/mod.rs`](enclave-nitro/apps/shell/mod.rs) (search `shell_status`) |

## Repo layout

```
move/                      Sui Move package — published to testnet
  sources/
    shell.move             SHELL OTW + init bootstrap + seal_approve policy
    pool.move              Pool, OrderCommitment, SettlementReceipt
    attestation.move       MatchPayload + MatchInstruction hot-potato (wraps enclave::verify_signature)
    settlement.move        settle_direct<TBase, TQuote> consumes hot-potato + both orders
ts-sdk/                    @shell-finance/sdk
  src/                     encryptOrder, submitOrderTx, OrderPlaintext BCS schema
  scripts/                 submit-test-order.mjs, spike-end-to-end.mjs
  deployments/testnet.json Object IDs from testnet publish
enclave-nitro/             Nautilus app overlay (drops into a MystenLabs/nautilus checkout)
  apps/shell/              Rust /process_data handler + allowed_endpoints.yaml
  framework-patches/       lib.rs + main.rs overlays (persistent eph_kp, AppState.shell)
  scripts/assemble.sh      Clones nautilus, applies patches, copies the overlay
web/                       Trader-facing Next.js app (dapp-kit wallet, sealed-order form, receipts)
shell-agent/               Autonomous quant/bot daemon — see below
  src/agent.ts             Main loop: auto-post IOI → poll → LLM eval (tool-use) → execute
  src/llm/                 Pluggable LLM layer: OpenAI, Anthropic, Google, openai-compatible
  src/tools/               9 built-in tools + plugin loader + MCP client
  plugins/                 Drop-in local tools (gitignored; README.md checked in)
  mcp.example.json         MCP server config template (walrus, pyth examples)
mcp/walrus-mcp/            Walrus + MemWal MCP server — 11 typed tools over stdio
  src/server.ts            Tool registration + dispatch
  src/tools/               put / get / status / extend / delete / put_quilt /
                           list_owned / head_pointer / memwal.{remember,recall,restore}
skills/walrus/SKILL.md     Zero-install Claude Code skill — CLI install + flow + head-pointer pattern
ui-guide/                  Static HTML mockups (design intent, not code to import)
```

## Quick start

### Move

```bash
cd move
sui move build                # requires sui 1.71+
sui move test                 # 11 tests pass
```

### Nautilus enclave overlay

The Rust matcher + signer lives in [`enclave-nitro/apps/shell/`](enclave-nitro/apps/shell/) and drops into a clone of [`MystenLabs/nautilus`](https://github.com/MystenLabs/nautilus). Tldr:

```bash
enclave-nitro/scripts/assemble.sh ~/nautilus   # idempotent
# then on AWS: configure_enclave.sh shell, make ENCLAVE_APP=shell, register_enclave.sh
```

### TS SDK

```bash
cd ts-sdk
npm install
npm run build
```

### shell-agent (autonomous quant/bot daemon)

```bash
cd shell-agent
npm install
cp .env.example .env
# Set AGENT_PRIVATE_KEY + LLM_API_KEY (or OPENAI_API_KEY for legacy compat)
npm run build
node dist/index.js run        # 24/7 autonomous loop
node dist/index.js demo       # scripted two-wallet E2E demo
```

See [`shell-agent/README.md`](shell-agent/README.md) for full setup, policy writing guide, and extension docs.

---

### Walrus MCP server (agent surface)

Two transports. Pick whichever fits the client.

**Remote (no install, public HTTPS):** the server runs on the demo EC2 host behind nginx + Let's Encrypt.

```bash
claude mcp add walrus --transport http https://sui.furqaannabi.com/mcp
```

Claude Desktop config:

```json
{ "mcpServers": { "walrus": {
  "url": "https://sui.furqaannabi.com/mcp",
  "transport": "streamable-http"
} } }
```

Quick smoke check:

```bash
curl -X POST https://sui.furqaannabi.com/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**Local (stdio):** build the package and point Claude Code at the binary.

```bash
cd mcp/walrus-mcp
npm install && npm run build
claude mcp add walrus -- node "$(pwd)/dist/server.js"
```

Eleven tools become available either way: `walrus.put/get/status/extend/delete/put_quilt/list_owned/head_pointer` and `memwal.remember/recall/restore`. `put`/`get`/`status` and the two Sui RPC tools work with zero config against testnet; the signed-tx tools need `WALRUS_KEYPAIR_PATH` and the MemWal tools need a delegate key from <https://app.memwal.com>. Deploy runbook in [`mcp/walrus-mcp/deploy/DEPLOY.md`](mcp/walrus-mcp/deploy/DEPLOY.md).

Zero-install fallback skill: drop [`skills/walrus/SKILL.md`](skills/walrus/SKILL.md) into your Claude Code skills directory, or fetch it from the live frontend at <https://shell-finance.vercel.app/skills.md>.

### End-to-end demo (testnet)

The enclave is autonomous: submit a sealed order from any client and the matching loop picks it up, decrypts it inside the TEE, finds a counterparty, and lands the settlement PTB itself. Two ways to drive it:

```bash
# 1. Frontend: connect a wallet at http://localhost:3000, place a sealed order
( cd web && npm run dev )

# 2. SDK: submit one or two orders, then watch the enclave settle them
( cd ts-sdk && npm run build && node scripts/submit-test-order.mjs )
```

Either path produces an `OrderCommitment` shared object on testnet. The enclave's poller picks it up within ~5s, requests Seal key shares (`shell::shell::seal_approve` gates this — only this enclave's registered pubkey can request), decrypts in-TEE, runs price-time matching, and submits a `Transaction` chaining `attestation::verify` → `settlement::settle_direct<TBase, TQuote>` signed by the enclave's eph_kp. Two `SettlementReceipt`s mint, one per trader.

## Agent execution layer (shell-agent)

Shell Finance has two client interfaces. The web UI is for human traders. `shell-agent` is for quants and bots.

```
┌──────────────────────┐     ┌──────────────────────────────────────────┐
│      Web UI          │     │            shell-agent                   │
│  (human trader)      │     │         (quant / bot operator)           │
│                      │     │                                          │
│  Connect wallet      │     │  Fund a wallet, set AGENT_POLICY         │
│  Place sealed order  │     │  node dist/index.js run                  │
│  Accept proposals    │     │                                          │
│  View receipts       │     │  Every 15s — auto-posts IOIs,            │
│                      │     │  polls proposals, runs LLM tool-use      │
│  Key: wallet ext     │     │  loop, executes accepted matches         │
└──────────────────────┘     │                                          │
                             │  Key: AGENT_PRIVATE_KEY in .env          │
                             └──────────────────────────────────────────┘
```

### What the agent actually does

On each 15s tick:

1. **Auto-post IOI** — Seal-encrypts your indication of interest (side/size range/price range) and records it on-chain. Only the Nautilus enclave can decrypt it.
2. **Poll** `MatchProposed` events for this wallet address. Each event means the enclave found a counterparty whose IOI overlaps yours.
3. **LLM tool-use loop** — The LLM (your choice of provider) can call any registered tool before deciding. Built-in tools include live DeepBook market data, wallet balance, recent fills, active orders, and risk cap checks. The loop runs up to 6 rounds before forcing a final `accept_match / reject_match / wait` decision.
4. **Execute** if `decision === "accept_match"` AND `policy_check === true` — Seal-encrypts a Shell sealed order and submits the PTB on-chain.

### Why quants care

- **BYO key** — your private key never leaves your machine. Self-hosted like any algo trading bot on Binance or dYdX.
- **BYO LLM** — `LLM_PROVIDER=openai|anthropic|google|openai-compatible`. Bring your own key, model, or endpoint (Ollama, vLLM, OpenRouter, etc.).
- **Policy in plain English** — write compliance rules in `AGENT_POLICY`; the LLM enforces them against real market data from tools.
- **Extensible** — drop `.js`/`.mjs` files into `plugins/` for custom oracles or signals. Connect any MCP server via `mcp.json` for external data feeds.
- **Risk caps** — `RISK_MAX_POSITION_SUI` / `RISK_DAILY_VOLUME_SUI` env vars gate the `check_risk_cap` tool. LLM sees real position data instead of hallucinating.

### LLM providers

| `LLM_PROVIDER` | Models |
|---|---|
| `openai` | `gpt-4o-mini`, `gpt-4o` (default when only `OPENAI_API_KEY` set) |
| `anthropic` | `claude-haiku-4-5-20251001`, `claude-sonnet-4-6` |
| `google` | `gemini-2.0-flash`, `gemini-2.5-pro` |
| `openai-compatible` | Any OpenAI-shaped endpoint — Ollama, vLLM, OpenRouter, Together, Groq |

### Demo output (verified testnet run)

```
STEP 1 — AI policy enforcement (synthetic bad proposal)
[tool] get_ref_price({}) → {"bid":1.04,"ask":1.048,"mid":1.044}
[tool] get_my_balance({}) → {"sui":2.14,"usdc":19.85}
LLM decision : reject_match
✓ bad proposal rejected — no order submitted

STEP 3 — Enclave matches
buyer got proposal: price=1.0000 USDC size=0.1500 SUI
[tool] get_ref_price({}) → {"bid":1.04,"ask":1.048,"mid":1.044}
[tool] get_my_balance({}) → {"sui":2.14,"usdc":19.85}
buyer LLM decision : accept_match  policy_check: true
buyer ✓ order submitted: EJndeAzDkzQTzLKtP33ewXQ84mrRCjQeXsyEpJqkHkV2

STEP 5 — Post-settlement
BUYER  SUI=2.2870  USDC=19.7000   (+0.15 SUI, -0.15 USDC ✓)
SELLER SUI=1.6861  USDC=40.3000   (-0.15 SUI, +0.15 USDC ✓)
```

## Frontend integration

The TS SDK covers client setup, encrypt + submit, dapp-kit wallet flow, receipt observation, and pitfalls.

## Architecture

```
╔═════════════════════════════════════════════════════════════════════════════╗
║                              SHELL FINANCE                                  ║
║              confidential dark pool on Sui — sealed intent                  ║
╚═════════════════════════════════════════════════════════════════════════════╝

  ┌──────────────────────────────────────────────────────────────────────┐
  │                          CLIENT LAYER                                │
  │                                                                      │
  │   ┌────────────┐      ┌────────────┐      ┌──────────────────────┐   │
  │   │   TRADER   │      │  TRADER    │      │  HEADLESS AGENT      │   │
  │   │  Sui wallet│      │  dApp UI   │      │ @shell-finance/      │   │
  │   │ (dapp-kit) │      │ Next.js    │      │   shell-agent (npm)  │   │
  │   └─────┬──────┘      └─────┬──────┘      └──────────┬───────────┘   │
  │         │                   │                        │               │
  │         └─────┬─────────────┴──────────┬─────────────┘               │
  │               │                        │                             │
  │               ▼                        ▼                             │
  │      ┌──────────────────────────────────────────┐                    │
  │      │       @shell-finance/sdk  (npm)          │                    │
  │      │  encryptOrder · submitOrderTx ·          │                    │
  │      │  settleMatchTx · getActiveOrders ·       │                    │
  │      │  getReceipts                             │                    │
  │      └────────┬─────────────────────────┬───────┘                    │
  │   plaintext   │                         │  sealed envelope           │
  │   OrderPlain  │                         │  + commit hash             │
  └───────────────┼─────────────────────────┼────────────────────────────┘
                  │                         │
                  ▼                         │
  ┌──────────────────────────────┐          │
  │     SEAL (Mysten threshold)  │          │
  │  • IBE encrypt under         │          │
  │    Move-policy identity      │          │
  │  • threshold N-of-M key      │          │
  │    servers                   │          │
  └──────────────┬───────────────┘          │
                 │ ciphertext               │
                 ▼                          │
  ┌──────────────────────────────┐          │
  │           WALRUS             │          │
  │   ciphertext blob storage    │          │
  │   returns blobId             │          │
  └──────────────┬───────────────┘          │
                 │ blobId                   │
                 └──────────┬───────────────┘
                            ▼
  ╔═════════════════════════════════════════════════════════════════════════╗
  ║                          SUI ON-CHAIN                                   ║
  ║                                                                         ║
  ║  ┌──────────────────────────────────────────────────────────────────┐   ║
  ║  │  shell::pool   (shared object)                                   │   ║
  ║  │   • OrderCommitment<T>  ← locked collateral coin<T>              │   ║
  ║  │   • commitHash · blobId · expiryEpoch · trader                   │   ║
  ║  │   • registered Nitro PCR set                                     │   ║
  ║  │   ─ submit_order<T>                                              │   ║
  ║  │   ─ cancel_anytime<T>   (post-expiry collateral reclaim)         │   ║
  ║  └────────────┬─────────────────────────────────────────┬───────────┘   ║
  ║               │ event:                                  ▲               ║
  ║               │  OrderSubmitted{id, blobId, ...}        │ consume       ║
  ║               ▼                                         │ in same PTB   ║
  ║  ┌──────────────────────────────────────────────────────┴───────────┐   ║
  ║  │  shell::attestation                                              │   ║
  ║  │   ─ verify_v2(enclave, MatchPayloadV2, sig)                      │   ║
  ║  │      checks Ed25519 sig vs enclave pubkey + PCR registry         │   ║
  ║  └────────────┬─────────────────────────────────────────────────────┘   ║
  ║               │ verified MatchInstruction (hot potato)                  ║
  ║               ▼                                                         ║
  ║  ┌──────────────────────────────────────────────────────────────────┐   ║
  ║  │  shell::settlement                                               │   ║
  ║  │   ─ settle_v4<TBase, TQuote>(pool, maker_cmt, taker_cmt,         │   ║
  ║  │       MatchInstruction, base_decimals)                           │   ║
  ║  │   • consumes BOTH OrderCommitments atomically                    │   ║
  ║  │   • crosses collateral peer-to-peer (NOT via DeepBook)           │   ║
  ║  │   • 0.1% protocol fee per side → treasury                        │   ║
  ║  │   • buyer price-improvement surplus refunded                     │   ║
  ║  │   • mints SettlementReceipt × 2 → owned by maker + taker         │   ║
  ║  └──────────────────────────────────────────────────────────────────┘   ║
  ║                                                                         ║
  ╚═════════════════════════════════════════════════════════════════════════╝
                            ▲                ▲
                            │ submit         │ poll OrderSubmitted
                            │ settlement PTB │ events
                            │                │
  ┌─────────────────────────┴────────────────┴────────────────────────────┐
  │                  AWS NITRO ENCLAVE  (matching)                        │
  │                                                                       │
  │   reproducible Marlin Oyster build · PCR set registered on-chain      │
  │                                                                       │
  │   1.  watches Sui RPC for OrderCommitment events                      │
  │   2.  fetches ciphertext from Walrus by blobId                        │
  │   3.  requests Seal decryption key                                    │
  │         └─ Seal Move policy gates release on PCR match                │
  │   4.  decrypts OrderPlaintext (side/size/limit/slippage)              │
  │   5.  price-time-priority match against book in memory                │
  │   6.  pulls reference price witness:                                  │
  │         ┌──────────────┬──────────────┬──────────────┐                │
  │         │   DeepBook   │  Pyth Hermes │  fixed NAV   │                │
  │         │  SUI/USDC    │  USDY + RWA  │ TBILL stub   │                │
  │         └──────────────┴──────────────┴──────────────┘                │
  │   7.  signs MatchPayloadV2 with enclave Ed25519 key                   │
  │         (carries deepbook_tx_digest as price witness, not settlement) │
  │   8.  publishes MatchProposed blob to Walrus                          │
  │   9.  submits settlement PTB → verify_v2 → settle_v4                  │
  │                                                                       │
  └───────────────────────────────┬───────────────────────────────────────┘
                                  │ MatchProposed (Walrus blobId on event)
                                  ▼
  ┌──────────────────────────────────────────────────────────────────────┐
  │                  AGENT / TRADER POLLING LOOP                         │
  │                                                                      │
  │   shell-agent (15s tick):                                            │
  │     • fetch MatchProposed blob → decode payload                      │
  │     • LLM tool-loop (max 6 rounds):                                  │
  │         get_ref_price · get_my_balance · check_risk_cap ·            │
  │         get_my_recent_iois · get_active_orders · plugins · MCP       │
  │     • decision: accept_match | reject_match                          │
  │     • if accept → SDK settleMatchTx → sign → submit                  │
  │                                                                      │
  └──────────────────────────────────────────────────────────────────────┘


╔═════════════════════════════════════════════════════════════════════════════╗
║  PRIVACY INVARIANTS                                                         ║
║                                                                             ║
║   pre-match:    side · size · limit · slippage   ALL SEALED                 ║
║   on-chain:     only commitHash + locked collateral coin                    ║
║   post-settle:  filled_size + filled_price       public                     ║
║                 original limit + max_slippage    STAY SEALED forever        ║
║                                                                             ║
║  TRUST BOUNDARIES                                                           ║
║                                                                             ║
║   Seal key servers:  threshold N-of-M, no single party decrypts             ║
║   Nitro enclave:     PCR-attested, reproducible build, ephemeral keys       ║
║   Sui validators:    see commitHash + collateral only                       ║
║   DeepBook / Pyth:   price witness only — NEVER a settlement venue          ║
╚═════════════════════════════════════════════════════════════════════════════╝
```

### In one breath

1. Trader's wallet (or SDK) Seal-encrypts an order envelope under a Move-policy IBE.
2. Sealed envelope is published to Sui as a shared `OrderCommitment` object.
3. Enclave's poller (running inside Nitro) sees the `OrderSubmitted` event, fetches the ciphertext, requests Seal key shares — `shell::shell::seal_approve` dry-runs on the key server and only passes if the requester address matches the on-chain registered enclave pubkey.
4. Enclave decrypts inside the TEE, BCS-checks the on-chain `commit_hash`, runs price-time matching against its in-memory book.
5. Enclave builds a `Transaction` chaining `shell::attestation::verify` → `shell::settlement::settle<TMaker, TTaker>`, signs it with `sui-crypto::SuiSigner` (IntentMessage + blake2b + Ed25519), BCS-serializes, and submits via `sui_executeTransactionBlock`.
6. Move side: `verify_v2` re-derives the BCS bytes and checks the enclave signature, produces a `MatchInstructionV2` hot-potato; `settle_v4` consumes it atomically with both `OrderCommitment`s, deducts a 0.1% protocol fee from each side, crosses collateral directly between maker and taker, and mints a `SettlementReceipt` per trader.

## On-chain testnet artifacts

Current testnet IDs after the 2026-05-24 clean-slate republish:

| Object | ID |
| --- | --- |
| Shell package (original-id) | `0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e` |
| Shell package (latest — `settle_v4` + `ESelfMatch` + fee + RWA) | `0x275cf49740a458b3ca92e85ca387b84dd16bd0466dd58efceb97614846e95031` |
| Shell package (prev — `settle_v3`) | `0xd2972abf8df0378463f3b5acf000a2af5de6af05acd893adba37952d2ecc805a` |
| `Pool` (shared) | `0x33682a9652567989b094989fcabe9eda53fbde32c4a3e0204657a06510bab22b` |
| `EnclaveConfig<SHELL>` (shared) | `0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504` |
| `Cap<SHELL>` (deployer) | `0x0c71e66d311f26a6dfa7ebbfb0dfc924439f503a5e7ac70280f92544c11770ef` |
| `UpgradeCap` | `0x85f63ef069759e511e9d82281071978e71d9b0e2a15930bcf86dae02c02ced55` |
| `Enclave<SHELL>` (current prod-mode) | `0xd002490d7e22d122e4b35f31bef0899d763afe628d1bf8f481b4d4099b6631a6` |
| PCR0 / PCR1 on `EnclaveConfig` | `0x3f5e13c47fa6ec5baa20b50e1de2b032569dc2921872ee2d9eb3fed444a16cb8dbfbc8dafb8be40bf331363f046be597` |
| PCR2 | `0x21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a` |
| Enclave Ed25519 pubkey (seed-derived, persistent) | `0x6fea82e844451e5c029253ebb91428a08df4868c098a44ebc8289bb0ee114613` |
| First green E2E on new package: IOI → match → accept → `settle_direct` | [`2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig`](https://suiscan.xyz/testnet/tx/2b96TNRe788nXw82bRyU4FpXA28RyMdMwUEsHRnAPKig) |

**Live enclave runs prod-mode.** AWS-signed attestation; PCR0/1 = `0x3f5e13c4…` match the published EIF measurement. This build calls `verify_v2` + `settle_v4`, threads `base_decimals` through `MatchPayloadV2` (9 for SUI, 6 for TBILL and other non-SUI assets), and includes `match_id` in `MatchProposalPlaintext` so proposal blobs don't content-dedupe on Walrus. The on-chain `EnclaveConfig` is kept in sync with each EIF rebuild via `enclave::update_pcrs`. The `Enclave<SHELL>.pk` binding survives reboots via the host-managed `ENCLAVE_KEY_SEED`; `SHELL_ENCLAVE_ID` (pushed through VSOCK at boot) lets the binary follow a re-registration without rebuilding the EIF.

Previous (now-orphaned) IDs from the pre-republish chain are preserved in
[`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) under
`previous*` fields. Locked collateral in the old pool can still be
recovered by owners via the *old* package's `pool::cancel_anytime`; Shell
deliberately did not migrate any of it.

## Conventions

- Privacy invariants are non-negotiable: side, size, limit price, slippage are private pre-match and the original limit + max slippage stay private post-settlement. Anything that risks exposing these gets flagged explicitly.
- Move tests via `sui move test`; TS via `npm run build` (no test runner wired up yet); Nitro app tests run inside the nautilus tree once assembled.
- Commit per meaningful unit. Short imperative subject. The why goes in the body if it isn't obvious from the diff.

## Threat model

In one line: pre-trade privacy via Seal + Nautilus, post-trade auditability via on-chain receipts, atomic settlement via the hot-potato `MatchInstruction`, **no operator trust** (the matcher's binary is PCR-pinned).

### Self-match prevention

Wash trading is blocked at four layers:

- **Move** — `shell::settlement::settle_v4` aborts with `ESelfMatch` if `maker == taker`. `settle_v2` / `settle_v3` patched with the same assert for defense-in-depth on legacy callers.
- **Enclave matcher** — same-trader bid/ask pairs are skipped silently in both the order book scanner and the IOI pairer; an info log line surfaces the attempt for ops visibility.
- **TS SDK** — `settleMatchTx` throws synchronously when `maker === taker`, before building the PTB.
- **Move tests** — `move/tests/self_match_tests.move` covers both `settle_v3` and `settle_v4`.

**Residual risk — cross-address wash trading.** Self-match via two distinct on-chain addresses controlled by the same real-world actor is not prevented at protocol level. Vault contracts that mediate multiple users under a single on-chain address are likewise not supported as self-match exceptions — block is on the raw `address`, not a deeper notion of beneficial ownership. Both are out of hackathon scope; production deployments should layer KYC linkage at the consumer/vault tier or move to per-envelope `user_id` matching inside the enclave.

## License

Unlicensed / proprietary while the hackathon is running. License TBD before any external release.
