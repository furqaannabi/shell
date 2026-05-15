# Shell Finance

> Cryptographically trust-minimized institutional execution. Move enforces the rules, Seal + Nautilus enforce the privacy, DeepBook is the settlement venue — the composition exists nowhere else on-chain.

Hackathon build for Sui Overflow 2026 — **DeFi & Payments** track, Trust-Minimized Finance slot. Full spec lives in [`product.md`](product.md). Track positioning in [`product.md` §7.1](product.md). Honest threat model in [`product.md` §5](product.md).

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

**Spike GO criterion met on testnet** ([product.md §6.2](product.md)). Full Seal → Nautilus → on-chain settle loop runs end-to-end against a real prod-mode `Enclave<SHELL>`. Real AWS-signed attestation, real PCRs registered on the `EnclaveConfig`, real `SettlementReceipt`s minted.

| Layer    | What works                                                                              | Where                                                            |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Move     | Pool + OrderCommitment + Receipt; hot-potato MatchInstruction; seal_approve; 10/10 tests | [`move/`](move/)                                                 |
| Move     | Published to testnet at `0x5a47e786…`                                                  | [`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) |
| Nitro    | Prod-mode `Enclave<SHELL>` registered at `0x1b18a55…` (PCRs `619c7540…`, `21b9efbc…`)  | running on `m5.xlarge`, HTTP `54.80.82.200:3000`                |
| SDK      | `encryptOrder` (Seal IBE) + `submitOrderTx` (PTB builder)                               | [`ts-sdk/`](ts-sdk/)                                             |
| Enclave  | Nautilus app: BCS-matched matcher + Ed25519 signer behind HTTP `/process_data`         | [`enclave-nitro/apps/shell/`](enclave-nitro/apps/shell/)         |
| Demo     | Full Seal → Nautilus → on-chain settle loop (digest `CRumEFt7wuTn…`)                   | [`ts-sdk/scripts/spike-end-to-end.mjs`](ts-sdk/scripts/spike-end-to-end.mjs) |
| Web      | Connect wallet, place sealed order, view receipts — all on testnet                     | [`web/`](web/)                                                   |

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
  scripts/assemble.sh      Clones nautilus, applies patches, copies the overlay
web/                       Trader-facing Next.js app (dapp-kit wallet, sealed-order form, receipts)
docs/
  aws-deployment.md        Nitro provisioning runbook (assemble → configure → register)
  seal-in-nitro.md         Scope for closing the side-channel (port apps/seal-example, ~3-5 days)
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

### End-to-end demo (testnet)

Needs `sui client` configured for testnet with ~0.1 SUI in the active address, plus the registered Nitro enclave at the URL stashed in `ts-sdk/deployments/testnet.json` reachable.

```bash
( cd ts-sdk && npm run build )
node ts-sdk/scripts/spike-end-to-end.mjs
```

Submits two Seal-encrypted orders that cross, posts the plaintexts to the live enclave's `POST /process_data`, receives a signed `IntentMessage<MatchPayload>` envelope, then submits the settlement PTB on testnet — `shell::attestation::verify` produces the hot-potato `MatchInstruction`, `shell::settlement::settle` consumes it atomically with both `OrderCommitment`s and mints two `SettlementReceipt`s.

The Seal decryption step is still side-channeled (plaintexts ship over HTTP rather than the enclave fetching ciphertext and Seal key shares itself). The wire format of the signature is identical either way.

## Frontend integration

See [`ts-sdk/docs/frontend-integration.md`](ts-sdk/docs/frontend-integration.md) — covers client setup, encrypt + submit, dapp-kit wallet flow, receipt observation, and pitfalls.

## Architecture in one breath

1. Trader's wallet (or SDK) Seal-encrypts an order envelope under a Move-policy IBE.
2. Sealed envelope is published to Sui as a shared `OrderCommitment` object.
3. Nautilus enclave watches for new commitments, fetches Seal keys (gated by `shell::shell::seal_approve` which checks the requester is the registered enclave), decrypts inside the TEE, runs price-time-priority matching.
4. Enclave signs a BCS-encoded `IntentMessage<MatchPayload>` with its registered Ed25519 key.
5. Settlement PTB lands on Sui: `shell::attestation::verify` re-derives the BCS bytes, checks the signature, produces a `MatchInstruction` hot-potato; `shell::settlement::settle` consumes it atomically with the named `OrderCommitment`s, swaps collateral, mints `SettlementReceipt` to each trader.

Full system diagram in [`product.md` §4.1](product.md).

## On-chain testnet artifacts

| Object | ID |
| --- | --- |
| Shell package | `0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd` |
| `EnclaveConfig<SHELL>` | `0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f` |
| `Cap<SHELL>` (deployer) | `0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c` |
| `Enclave<SHELL>` (prod-mode) | `0x1b18a55393efa9378c11e4eac0ad94c3ec3759f85be6c92f71a7a3b074b871e1` |
| Latest settlement digest | `CRumEFt7wuTn7uPHJghtbnjdsS5LKnE35Kqdka3zMPDP` |

PCRs registered on-chain:
- PCR0 / PCR1: `0x619c75409481395d093fabe80991b428d2c5a39567eecea0dc464c7fcad9e2fe7b84ed5000224b5492b2b1dc6f52b56b`
- PCR2: `0x21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a`

## Honest list — what's not shipped

- **Seal decryption inside Nitro.** Today the trader's SDK posts plaintexts to `/process_data`; the prod path is the enclave fetching `OrderCommitment` ciphertext + Seal key shares via `fetch_key` (gated by `shell::shell::seal_approve`) and decrypting in-TEE. Wire shape of the response is identical. Scope + plan in [`docs/seal-in-nitro.md`](docs/seal-in-nitro.md) — 3–5 days; Mysten's `apps/seal-example` is the reference implementation.
- **DeepBook v3 settlement leg.** `shell::settlement::settle` currently does a direct collateral swap. Week-4 work per spec: replace with `place_limit_order<Base, Quote>(pool, balance_manager, trade_proof, …)` against a real DeepBook pool with a funded `BalanceManager` per trader.
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
