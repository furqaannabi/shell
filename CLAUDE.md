# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

**Spec / design phase only — no implementation code yet.** No package manifest, no build system, no tests. Don't invent build/test commands; if a task needs them, scaffold first and confirm tooling with the user.

## What this project is

Shell Finance — a confidential dark pool on Sui. Composition:

- **Seal** (Mysten threshold encryption with Move-policy access control) seals the order envelope.
- **Nautilus** (AWS Nitro Enclave, PCR-registered on-chain) decrypts and matches.
- **`shell::settlement`** crosses both parties atomically on Sui (Shell-internal peer-to-peer settlement, not via DeepBook).
- **Price discovery** is multi-source via `shell-agent/src/pairs.ts`: DeepBook v3 (SUI/USDC mid), Pyth Hermes (RWA pairs like USDY), or fixed NAV stub (testnet TBILL). Settlement does NOT route through any of them — they're match-time inputs, not settlement venues.

Full spec — architecture, Move sketches, threat model, 8-week plan — is in `product.md`. Read it before any non-trivial work.

## Repository layout

- `product.md` — authoritative technical spec (v0.1). Source of truth for module names, types, user flow, threat model, build phases.
- `ui-guide/` — static HTML mockups, one dir per screen (`trader_terminal/`, `operator_dashboard/`, `onboarding_login/`, `vaults_management/`, `system_logs/`, etc.). Each has `code.html` (Tailwind via CDN, dark theme) and `screen.png`. Treat as design intent, not code to import.
- `ui-guide/shell_finance_technical_specification_summary.txt` — short summary of `product.md`.
- `.agents/skills/` and `skills-lock.json` — skills synced from `mattpocock/skills`. Tooling for the agent, not project code.
- `README.md` — stub.

## Planned architecture (from product.md)

When code starts, expect three top-level packages, built and tested independently:

1. **Move package** — `shell::pool` (shared object with `OrderCommitment`, registered PCRs), `shell::attestation` (verifies Nautilus signatures vs PCR set), `shell::settlement` (hot-potato `MatchInstruction` consumed atomically alongside both `OrderCommitment`s in the same PTB, crossing collateral peer-to-peer and minting `SettlementReceipt`s). DeepBook is referenced only via the signed `deepbook_tx_digest` witness — settlement does not call DeepBook trade fns. Test via `sui move test`.
2. **Matching enclave (Rust)** — runs in AWS Nitro, reproducible build via Marlin Oyster. Watches Sui RPC for `OrderCommitment`, requests Seal keys (gated by attestation), runs price-time-priority matching, signs match instructions with an enclave Ed25519 key, submits the settlement PTB.
3. **TS SDK + operator console** — `@shell-finance/sdk` wraps `@mysten/seal` for client-side encryption and PTB construction; the Next.js console uses `@mysten/dapp-kit`, Enoki sponsored tx, and zkLogin.

The hot-potato in `shell::settlement` is load-bearing — `MatchInstruction` must be consumed in the same PTB that consumes both `OrderCommitment`s and mints a `SettlementReceipt`. The enclave-signed `deepbook_tx_digest` is the price-reference witness, not a DeepBook settlement leg. Don't break that invariant.

## Working conventions

### Skills — consult before acting

Pick the right skill at the **start** of a task, not after:

- **New feature / behavior change** → `superpowers:brainstorming` first, then `grill-me` to stress-test the design.
- **Plan vs. existing domain language and ADRs** → `grill-with-docs`.
- **Implementation** → `tdd` (red-green-refactor).
- **Bugs / regressions / unexpected behavior** → `diagnose` or `superpowers:systematic-debugging`.
- **Refactors / consolidation / making the codebase more navigable** → `improve-codebase-architecture`.
- **Turning conversation into a PRD or issues** → `to-prd`, `to-issues`.

If a skill applies, invoke it. Don't paraphrase from memory.

### Code style

Write the **simplest functional form** of code that solves the problem.

- Short lines. Break anything long.
- Short approach. No layered abstraction the task doesn't demand. No defensive scaffolding for impossible inputs.
- A one-liner that's clear beats a five-line helper.

### Spec is the source of truth

Spec changes belong in `product.md`. If a design decision is reached in conversation, update the relevant section there rather than scattering notes.

### Privacy invariants are non-negotiable

Pre-match: side, size, limit price, slippage are private. Post-settlement: original limit and original max slippage stay private. Any change that risks exposing these must be flagged explicitly. Don't write code or copy that overstates guarantees — Section 5 of `product.md` is the honest threat model.



### Commits

Commit after each meaningful unit of work. Small, focused commits. Standard style: short imperative subject, body only when the why isn't obvious.
