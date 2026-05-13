# Shell Finance

> Cryptographically trust-minimized institutional execution. Move enforces the rules, Seal + Nautilus enforce the privacy, DeepBook is the settlement venue — the composition exists nowhere else on-chain.

Hackathon build for Sui Overflow 2026 — **DeFi & Payments** track, Trust-Minimized Finance slot. Full spec lives in [`product.md`](product.md). Track positioning in [`product.md` §7.1](product.md). Honest threat model in [`product.md` §5](product.md).

## Status

**Spike checkpoint reached.** Move package on testnet, SDK + enclave producing real artifacts. End-to-end settlement on-chain is blocked on AWS Nitro — see [§ Blocked on Nitro](#blocked-on-nitro).

| Layer    | What works                                                                              | Where                                                            |
| -------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Move     | Pool + OrderCommitment + Receipt; hot-potato MatchInstruction; seal_approve; 10/10 tests | [`move/`](move/)                                                 |
| Move     | Published to testnet at `0x5a47e786…`                                                   | [`ts-sdk/deployments/testnet.json`](ts-sdk/deployments/testnet.json) |
| SDK      | `encryptOrder` (Seal IBE) + `submitOrderTx` (PTB builder)                               | [`ts-sdk/`](ts-sdk/)                                             |
| Enclave  | BCS types matching Move byte-for-byte; Ed25519 signer; price-time-priority matcher      | [`enclave/`](enclave/)                                           |
| Demo     | Crossing pair submitted on testnet → matched → signed locally                           | [`ts-sdk/scripts/spike-end-to-end.mjs`](ts-sdk/scripts/spike-end-to-end.mjs) |

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
enclave/                   shell-enclave Rust crate
  src/                     BCS types (order, match_payload), signer, matcher
  src/bin/                 match-and-sign — stdin orders → stdout signed matches
ui-guide/                  Static HTML mockups (design intent, not code to import)
```

## Quick start

### Move

```bash
cd move
sui move build                # requires sui 1.71+
sui move test                 # 10 tests pass
```

### Rust enclave

```bash
cd enclave
cargo test                    # 12 tests pass
cargo build --release --bin match-and-sign
```

### TS SDK

```bash
cd ts-sdk
npm install
npm run build
```

### End-to-end demo (testnet)

Needs `sui client` configured for testnet with ~0.1 SUI in the active address.

```bash
# from repo root, prereqs first:
( cd ts-sdk && npm run build )
( cd enclave && cargo build --release --bin match-and-sign )
# run the spike:
node ts-sdk/scripts/spike-end-to-end.mjs
```

Submits two Seal-encrypted orders that cross, hands the plaintexts to the local enclave binary (offline mode — production decrypts via Seal inside Nitro), and prints the signed match the enclave would feed into `shell::attestation::verify`.

## Frontend integration

See [`ts-sdk/docs/frontend-integration.md`](ts-sdk/docs/frontend-integration.md) — covers client setup, encrypt + submit, dapp-kit wallet flow, receipt observation, and pitfalls.

## Architecture in one breath

1. Trader's wallet (or SDK) Seal-encrypts an order envelope under a Move-policy IBE.
2. Sealed envelope is published to Sui as a shared `OrderCommitment` object.
3. Nautilus enclave watches for new commitments, fetches Seal keys (gated by `shell::shell::seal_approve` which checks the requester is the registered enclave), decrypts inside the TEE, runs price-time-priority matching.
4. Enclave signs a BCS-encoded `IntentMessage<MatchPayload>` with its registered Ed25519 key.
5. Settlement PTB lands on Sui: `shell::attestation::verify` re-derives the BCS bytes, checks the signature, produces a `MatchInstruction` hot-potato; `shell::settlement::settle` consumes it atomically with the named `OrderCommitment`s, swaps collateral, mints `SettlementReceipt` to each trader.

Full system diagram in [`product.md` §4.1](product.md).

## Blocked on Nitro

The two final on-chain PTBs (`attestation::verify`, `settlement::settle`) require an `Enclave<SHELL>` object. That object is created only by `enclave::register_enclave`, which requires a real AWS Nitro attestation document whose PCRs match our registered `EnclaveConfig`. We don't have a running Nitro enclave yet.

Until then:
- The signing path is exercised by [`enclave/src/signer.rs`](enclave/src/signer.rs) tests and verified at the wire level against the upstream `enclave::test_serde` reference vector.
- The on-chain settlement path is exercised by [`move/tests/settlement_tests.move`](move/tests/settlement_tests.move) via a `#[test_only] attestation::new_for_testing` constructor that skips the signature check.
- The crossing-pair demo runs end-to-end up to the signed-match artifact ([`spike-end-to-end.mjs`](ts-sdk/scripts/spike-end-to-end.mjs)).

Next step is wrapping the matcher into a Nautilus / Marlin Oyster reproducible-build enclave on AWS Nitro. Mostly manual cloud work.

## Conventions

- Spec is the source of truth — design changes belong in [`product.md`](product.md) before code.
- Privacy invariants are non-negotiable: side, size, limit price, slippage are private pre-match and the original limit + max slippage stay private post-settlement. Anything that risks exposing these gets flagged explicitly.
- Move tests via `sui move test`, Rust via `cargo test`, TS via `npm run build` (no test runner wired up yet).
- Commit per meaningful unit. Short imperative subject. The why goes in the body if it isn't obvious from the diff.

## Threat model

In one line: pre-trade privacy via Seal + Nautilus, post-trade auditability via on-chain receipts, settlement against DeepBook's depth, **no operator trust** (the matcher's binary is PCR-pinned). The full table — adversary capability vs mitigation, plus the four things we explicitly do NOT defend against — is in [`product.md` §5](product.md).

## License

Unlicensed / proprietary while the hackathon is running. License TBD before any external release.
