# Shell Finance

> Cryptographically trust-minimized institutional execution. Move enforces the rules, Seal + Nautilus enforce the privacy, DeepBook is the settlement venue — the composition exists nowhere else on-chain.

Hackathon build for Sui Overflow 2026 — **DeFi & Payments** track, Trust-Minimized Finance slot. Full spec lives in [`product.md`](product.md). Track positioning in [`product.md` §7.1](product.md). Honest threat model in [`product.md` §5](product.md).

## Status

**Spike checkpoint reached.** Move package on testnet, SDK + enclave producing real artifacts. End-to-end settlement on-chain is blocked on AWS Nitro — see [§ Blocked on Nitro](#blocked-on-nitro).

| Layer    | What works                                                                              | Where                                                            |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Move     | Pool + OrderCommitment + Receipt; hot-potato MatchInstruction; seal_approve; 10/10 tests | [`move/`](move/)                                                 |
| Move     | Published to testnet at `0x5a47e786…`; Enclave<SHELL> registered at `0xdf07cfd1…`      | [`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) |
| SDK      | `encryptOrder` (Seal IBE) + `submitOrderTx` (PTB builder)                               | [`ts-sdk/`](ts-sdk/)                                             |
| Enclave  | Nautilus app: BCS-matched matcher + Ed25519 signer behind HTTP `/process_data`         | [`enclave-nitro/apps/shell/`](enclave-nitro/apps/shell/)         |
| Demo     | Full Seal → Nautilus → on-chain settle loop on testnet                                 | [`ts-sdk/scripts/spike-end-to-end.mjs`](ts-sdk/scripts/spike-end-to-end.mjs) |

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
docs/                      aws-deployment.md walkthrough for the Nitro side
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

## Spike GO criterion — met

Reached on testnet. `Enclave<SHELL>` registered at `0xdf07cfd107e154ecbc6e5aa9292b2d2342c42fb978624456a4695924a20cf3da`; settlement PTB run digest `7USfM7tuiDipnL63wDaDS1hSZudSPgPZ12oPEVfsL97n` consumed the hot-potato + minted two `SettlementReceipt`s.

What's still side-channeled or stubbed (honest list):

- **Seal decryption inside Nitro.** Today the trader's SDK posts plaintexts to `/process_data`; the prod path is the enclave fetching `OrderCommitment` ciphertext + Seal key shares via `fetch_key` (gated by `shell::shell::seal_approve`) and decrypting in-TEE. Wire shape of the response is identical.
- **Debug-mode PCRs.** The enclave was built and registered with `--debug-mode`; PCR0/1/2 stored on the `EnclaveConfig` are zeros, so the "this is the registered binary" check is vacuous. A `make run` (prod-mode) rebuild + `update_pcrs` + re-register is the cleanup.
- **DeepBook v3 leg.** `shell::settlement::settle` currently does a direct collateral swap; the week-4 work is replacing that with `place_limit_order<Base, Quote>(pool, balance_manager, trade_proof, …)` against a real DeepBook pool.

## Conventions

- Spec is the source of truth — design changes belong in [`product.md`](product.md) before code.
- Privacy invariants are non-negotiable: side, size, limit price, slippage are private pre-match and the original limit + max slippage stay private post-settlement. Anything that risks exposing these gets flagged explicitly.
- Move tests via `sui move test`, Rust via `cargo test`, TS via `npm run build` (no test runner wired up yet).
- Commit per meaningful unit. Short imperative subject. The why goes in the body if it isn't obvious from the diff.

## Threat model

In one line: pre-trade privacy via Seal + Nautilus, post-trade auditability via on-chain receipts, settlement against DeepBook's depth, **no operator trust** (the matcher's binary is PCR-pinned). The full table — adversary capability vs mitigation, plus the four things we explicitly do NOT defend against — is in [`product.md` §5](product.md).

## License

Unlicensed / proprietary while the hackathon is running. License TBD before any external release.
