# Shell Finance

> Cryptographically trust-minimized institutional execution. Move enforces the rules, Seal + Nautilus enforce the privacy, DeepBook is the settlement venue — the composition exists nowhere else on-chain.

Hackathon build for Sui Overflow 2026 — **DeFi & Payments** track, Trust-Minimized Finance slot. Full spec lives in [`product.md`](product.md). Track positioning in [`product.md` §7.1](product.md). Honest threat model in [`product.md` §5](product.md).

**Live on testnet:**

- Web app — <https://shell-finance.vercel.app/>
- Walrus + MemWal MCP (Streamable HTTP) — `POST https://sui.furqaannabi.com/mcp` ([runbook](mcp/walrus-mcp/deploy/DEPLOY.md))
- Nitro enclave HTTP surface — <https://sui.furqaannabi.com/>
- Walrus skill (markdown) — <https://shell-finance.vercel.app/skills.md>

## Problem

Every public order book on-chain — DeepBook included — exposes order intent before execution. For retail flow that's acceptable; for institutional size it's an execution tax: searchers front-run, market makers fade quotes, and large orders can't be worked without significant slippage. Existing on-chain attempts at hiding flow are each partial:

- **Stealth-address payments** (PIVY, Umbra) hide recipients but not order flow.
- **Privacy AMMs** (Shroud, Penumbra) hide swaps but pay AMM-curve slippage and can't serve institutional size.
- **ZK rollups** (Aztec, Aleo) provide privacy but lose access to the host chain's deepest liquidity.
- **Off-chain dark pools** (sFOX, ErisX) require trusting a single operator and lack on-chain settlement guarantees.

An institutional venue needs four properties at once: pre-trade order privacy, post-trade auditability, settlement against the deepest available liquidity, and zero operator trust. No chain previously had the primitives to deliver all four.

## Solution

Shell composes three Sui-native primitives — and nothing else does it:

| Layer    | What it enforces                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------ |
| **Seal**     | Threshold IBE seals each order envelope. Decryption only fires when an on-chain Move policy says yes.              |
| **Nautilus** | The matching engine runs in an AWS Nitro Enclave. The binary is PCR-pinned on-chain — the operator can't tamper.   |
| **DeepBook** | The on-chain CLOB is the settlement venue. Matches land as fait accompli via a hot-potato PTB that can't be split. |

Pre-match the chain sees only ciphertext + a commit hash. Post-settlement the chain shows a `SettlementReceipt` per side and the swapped balances. Side, size, limit price, and slippage from the original order stay private forever.

The threat-model honesty: there is an irreducible trust set (Sui consensus + Seal key-server quorum + AWS Nitro hardware), and we don't hide it. The full adversary-vs-mitigation table is in [`product.md` §5](product.md).

## User flow

1. **Connect wallet** — dapp-kit, Sui Wallet / Suiet / etc.
2. **Place a sealed order** — pick side / size / limit / expiry / slippage. The SDK Seal-IBE-encrypts the BCS plaintext under a random per-order id, builds a PTB calling `shell::pool::submit_order`, the wallet signs. On-chain: a shared `OrderCommitment` lands with the sealed envelope as opaque bytes.
3. **See it in active orders** — the row shows a commit-hash fingerprint, `SEALED` status. Cancel works after expiry.
4. **Match (invisible)** — the Nautilus enclave decrypts plaintexts in-TEE, runs price-time matching, signs an `IntentMessage<MatchPayload>` envelope. A settlement PTB lands: `shell::attestation::verify` produces a `MatchInstruction` hot-potato, `shell::settlement::settle` consumes it atomically with both orders, swaps collateral.
5. **See the receipt** — a `SettlementReceipt` per side appears under the trader's address, and the wallet shows the swapped coin balance. The trader's original limit price + slippage are never revealed on-chain.

## Status

**Autonomous Seal-in-Nitro loop running on testnet.** The enclave watches Sui for `OrderSubmitted` events, fetches each `OrderCommitment` ciphertext, requests Seal key shares (gated by `shell::shell::seal_approve`), decrypts inside the TEE, runs price-time matching, builds + signs a real `sui_sdk_types::Transaction`, and submits the settlement PTB itself — no trader, host, or operator in the signing path. The enclave's signing identity is derived from a host-managed seed (`ENCLAVE_KEY_SEED`) so the on-chain `Enclave<SHELL>` registration survives reboots.

| Layer    | What works                                                                              | Where                                                            |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Move     | Pool + OrderCommitment + Receipt; hot-potato MatchInstruction; seal_approve; 10/10 tests | [`move/`](move/)                                                 |
| Move     | Published to testnet at `0x6a9fb5d2…` (original), upgraded to v2 `0x68aae56c…` (adds `shell::ioi`) | [`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) |
| Enclave  | Autonomous poller: Seal decrypt → match → sign → on-chain settle, all in-TEE             | [`enclave-nitro/apps/shell/mod.rs`](enclave-nitro/apps/shell/mod.rs) |
| Nitro    | **Prod-mode** `Enclave<SHELL>` `0xe342ee55…`, real PCR0/1 `0x84e4de37…`, persistent eph_kp | running on `m5.xlarge` at `https://sui.furqaannabi.com`         |
| SDK      | `encryptOrder` (Seal IBE) + `submitOrderTx` (PTB builder)                               | [`ts-sdk/`](ts-sdk/)                                             |
| Demo     | Six consecutive autonomous on-chain settlements in ~20s (first digest `4fdfgYhsYuCvwY…`) | [`docs/seal-in-nitro.md`](docs/seal-in-nitro.md)                |
| Web      | Connect wallet, place sealed order, view receipts — all on testnet                     | <https://shell-finance.vercel.app/> ([source](web/))             |
| Agents   | Walrus + MemWal MCP server (11 typed tools); stdio for local + Streamable HTTP at `https://sui.furqaannabi.com/mcp` | [`mcp/walrus-mcp/`](mcp/walrus-mcp/), [`skills/walrus/`](skills/walrus/) |

## Repo layout

```
product.md                 Authoritative spec (v0.1). Read before non-trivial work.
move/                      Sui Move package — published to testnet
  sources/
    shell.move             SHELL OTW + init bootstrap + seal_approve policy
    pool.move              Pool, OrderCommitment, SettlementReceipt
    attestation.move       MatchPayload + MatchInstruction hot-potato (wraps enclave::verify_signature)
    settlement.move        settle<TMaker, TTaker> consumes hot-potato + both orders
ts-sdk/                    @shell-finance/sdk
  src/                     encryptOrder, submitOrderTx, OrderPlaintext BCS schema
  scripts/                 submit-test-order.mjs, spike-end-to-end.mjs
  docs/                    frontend-integration.md
  deployments/testnet.json Object IDs from testnet publish
enclave-nitro/             Nautilus app overlay (drops into a MystenLabs/nautilus checkout)
  apps/shell/              Rust /process_data handler + allowed_endpoints.yaml
  framework-patches/       lib.rs + main.rs overlays (persistent eph_kp, AppState.shell)
  scripts/assemble.sh      Clones nautilus, applies patches, copies the overlay
web/                       Trader-facing Next.js app (dapp-kit wallet, sealed-order form, receipts)
mcp/walrus-mcp/            Walrus + MemWal MCP server — 11 typed tools over stdio
  src/server.ts            Tool registration + dispatch
  src/tools/               put / get / status / extend / delete / put_quilt /
                           list_owned / head_pointer / memwal.{remember,recall,restore}
skills/walrus/SKILL.md     Zero-install Claude Code skill — CLI install + flow + head-pointer pattern
docs/
  agent-mode.md            Headless Node-daemon agent design (Walrus state, head pointer)
  walrus-agent-tooling.md  MCP + skill design for LLM-driven agents
  aws-deployment.md        Nitro provisioning runbook (assemble → configure → register)
  seal-in-nitro.md         Autonomous loop walkthrough + wire-format gotchas
ui-guide/                  Static HTML mockups (design intent, not code to import)
```

## Quick start

### Move

```bash
cd move
sui move build                # requires sui 1.71+
sui move test                 # 10 tests pass
```

### Nautilus enclave overlay

The Rust matcher + signer lives in [`enclave-nitro/apps/shell/`](enclave-nitro/apps/shell/) and drops into a clone of [`MystenLabs/nautilus`](https://github.com/MystenLabs/nautilus). See [`docs/aws-deployment.md`](docs/aws-deployment.md) for the full AWS deploy. Tldr:

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

Eleven tools become available either way: `walrus.put/get/status/extend/delete/put_quilt/list_owned/head_pointer` and `memwal.remember/recall/restore`. `put`/`get`/`status` and the two Sui RPC tools work with zero config against testnet; the signed-tx tools need `WALRUS_KEYPAIR_PATH` and the MemWal tools need a delegate key from <https://app.memwal.com>. Design rationale + composition stories in [`docs/walrus-agent-tooling.md`](docs/walrus-agent-tooling.md). Deploy runbook in [`mcp/walrus-mcp/deploy/DEPLOY.md`](mcp/walrus-mcp/deploy/DEPLOY.md).

Zero-install fallback skill: drop [`skills/walrus/SKILL.md`](skills/walrus/SKILL.md) into your Claude Code skills directory, or fetch it from the live frontend at <https://shell-finance.vercel.app/skills.md>.

### End-to-end demo (testnet)

The enclave is autonomous: submit a sealed order from any client and the matching loop picks it up, decrypts it inside the TEE, finds a counterparty, and lands the settlement PTB itself. Two ways to drive it:

```bash
# 1. Frontend: connect a wallet at http://localhost:3000, place a sealed order
( cd web && npm run dev )

# 2. SDK: submit one or two orders, then watch the enclave settle them
( cd ts-sdk && npm run build && node scripts/submit-test-order.mjs )
```

Either path produces an `OrderCommitment` shared object on testnet. The enclave's poller picks it up within ~5s, requests Seal key shares (`shell::shell::seal_approve` gates this — only this enclave's registered pubkey can request), decrypts in-TEE, runs price-time matching, and submits a `Transaction` chaining `attestation::verify` → `settlement::settle<TMaker, TTaker>` signed by the enclave's eph_kp. Two `SettlementReceipt`s mint, one per trader.

## Frontend integration

See [`ts-sdk/docs/frontend-integration.md`](ts-sdk/docs/frontend-integration.md) — covers client setup, encrypt + submit, dapp-kit wallet flow, receipt observation, and pitfalls.

## Architecture in one breath

1. Trader's wallet (or SDK) Seal-encrypts an order envelope under a Move-policy IBE.
2. Sealed envelope is published to Sui as a shared `OrderCommitment` object.
3. Enclave's poller (running inside Nitro) sees the `OrderSubmitted` event, fetches the ciphertext, requests Seal key shares — `shell::shell::seal_approve` dry-runs on the key server and only passes if the requester address matches the on-chain registered enclave pubkey.
4. Enclave decrypts inside the TEE, BCS-checks the on-chain `commit_hash`, runs price-time matching against its in-memory book.
5. Enclave builds a `Transaction` chaining `shell::attestation::verify` → `shell::settlement::settle<TMaker, TTaker>`, signs it with `sui-crypto::SuiSigner` (IntentMessage + blake2b + Ed25519), BCS-serializes, and submits via `sui_executeTransactionBlock`.
6. Move side: `verify` re-derives the BCS bytes and checks the enclave signature, produces a `MatchInstruction` hot-potato; `settle` consumes it atomically with both `OrderCommitment`s and mints a `SettlementReceipt` per trader.

Full system diagram in [`product.md` §4.1](product.md). Wire-level walkthrough in [`docs/seal-in-nitro.md`](docs/seal-in-nitro.md).

## On-chain testnet artifacts

| Object | ID |
| --- | --- |
| Shell package (DeepBook-enabled) | `0x6a9fb5d245856d9c81da6952b431dceebf870820766df0bee8a6339cb06a56fd` |
| `EnclaveConfig<SHELL>` | `0xd33555df99c5065a610e479ad39f711ba0219da1f04276b3c2be71101f8f7bb8` |
| `Cap<SHELL>` (deployer) | `0xfbbcb810f66ac05bb0924237eb488dce80b51afde44f5f68a3aacc2a287b2209` |
| `Enclave<SHELL>` (**prod-mode**, autonomous) | `0xe342ee55ef3b0107669318d9d9b3ced045afe5424e7dec265ee39e28d25cf948` |
| PCR0 / PCR1 on `EnclaveConfig` | `0x84e4de3710542d0f44468bb101135688ba8846acd24933071c33663e66a723b7cc8b1927eaa26b0d20028a4bc82b7dae` |
| Shell package latest version (v3, adds `pool::cancel_anytime`) | `0x2c7e80632d1964f24489da0ba6cfeb83379922baab003c476f1b26a79cb129b6` |
| PCR2 | `0x21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a` |
| Previous debug Enclave<SHELL> | `0xa6589585791e4f3aa80164cd98bf8fc3385ebe93ff64d0c371596e21362cc9c3` |
| Enclave Sui address (derived from eph_kp) | `0xeda60f47715ea94dae92a58467894f3882d18d8690a348df6e03b4e3cfef1114` |
| Enclave Ed25519 pubkey | `0x6fea82e844451e5c029253ebb91428a08df4868c098a44ebc8289bb0ee114613` |
| DeepBook testnet SUI/DBUSDC pool | `0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5` |
| Previous package (pre-DeepBook, direct-swap) | `0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd` |
| First autonomous direct-swap settlement digest | `4fdfgYhsYuCvwYFX4kfs3KajWrrrY6U8CbEYg2DgcXiw` |

**Live enclave runs prod-mode.** AWS-signed attestation; PCR0/1 = `0x84e4de37…` match the published EIF measurement. The on-chain `EnclaveConfig` was updated to those values (digest `HDwqbS7QUzq9vSa7KdAs7xGnDJWLR2GuicANuj3XrQA`) and `register_enclave` was called against a fresh prod-mode attestation (digest `RLZFudQeMvXo3GvWUmL6f32AFUrwHnfDkTb83y1YcGH`). The `Enclave<SHELL>.pk` binding survives reboots via the host-managed `ENCLAVE_KEY_SEED`; the new `SHELL_ENCLAVE_ID` env var (also pushed through the secrets blob) lets the binary follow a re-registration without yet another rebuild.

## Honest list — what's not shipped

- **DeepBook v3 settlement leg — code in, live demo trade pending DBUSDC depth.** `shell::settlement::settle<TBase, TQuote>` now wraps both legs in `swap_exact_base_for_quote` / `swap_exact_quote_for_base` against the SUI/DBUSDC pool, with `min_*_out` derived from the enclave-matched price. Either both legs fill at-or-better or the PTB reverts atomically. Move build clean, EIF rebuilt + deployed, enclave wallet funded with DEEP. A live crossing-pair demo on testnet additionally needs DBUSDC depth on the bid side of `0x1c19362c…` — the testnet pool was thin on the day of writing, so the headline still relies on the on-chain code path rather than a fresh tx digest. See [`docs/deepbook-integration.md`](docs/deepbook-integration.md).
- **Partial fills in the matcher.** v1 is whole-fill only.

## Conventions

- Spec is the source of truth — design changes belong in [`product.md`](product.md) before code.
- Privacy invariants are non-negotiable: side, size, limit price, slippage are private pre-match and the original limit + max slippage stay private post-settlement. Anything that risks exposing these gets flagged explicitly.
- Move tests via `sui move test`; TS via `npm run build` (no test runner wired up yet); Nitro app tests run inside the nautilus tree once assembled.
- Commit per meaningful unit. Short imperative subject. The why goes in the body if it isn't obvious from the diff.

## Threat model

In one line: pre-trade privacy via Seal + Nautilus, post-trade auditability via on-chain receipts, settlement against DeepBook's depth, **no operator trust** (the matcher's binary is PCR-pinned). The full table — adversary capability vs mitigation, plus the four things we explicitly do NOT defend against — is in [`product.md` §5](product.md).

## License

Unlicensed / proprietary while the hackathon is running. License TBD before any external release.
