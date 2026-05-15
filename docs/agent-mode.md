# Agent mode

Shell's second user surface alongside the manual trader. A headless process trades through Shell using the same SDK, persists its strategy state on Walrus so it survives restarts, and is monitored from a panel in the existing web app.

This doc fixes the architecture before any `shell-agent/` code lands. It does **not** introduce Move changes — agent mode is purely a new client of the existing on-chain primitives.

## Why this exists

- **Product**: institutional users want both manual and algorithmic execution. The same privacy + settlement guarantees apply.
- **Walrus track fit**: the track problem statement names "trading agents" and "long-running workflows where agents track state over time" verbatim. Shell-Agent uses Walrus as the durable memory layer that lets agents resume after a crash, share context across processes, and keep an auditable journal that outlives the agent itself.

## Two surfaces, one engine

```
              ┌── Manual ────── web/ (dapp-kit, sealed-order form, monitor)
              │
@shell-finance/sdk
  encryptOrder │
  submitOrderTx│  unchanged — both surfaces consume the same exports
  settleMatchTx│
              │
              └── Agent ─────── shell-agent/ (Node daemon)
                                ├ wallet (own Ed25519, persisted on Walrus encrypted)
                                ├ trigger loop (time / Pyth / journal)
                                ├ Walrus state (read on boot, write on event)
                                └ keeper role (POST /process_data, submit settle)
```

The SDK doesn't change. The agent is just another wallet from Shell's perspective.

## State on Walrus

Four blob roles, one head pointer.

| Blob                | Lifetime  | Written on                                  | Read on |
| ------------------- | --------- | ------------------------------------------- | ------- |
| `wallet`            | permanent | first boot (encrypted under user policy)    | every boot |
| `strategy_state`    | rolling   | every fill, every param change              | every boot, every restart |
| `journal`           | append    | every signal + decision + outcome           | analytics + audits |
| `config`            | mutable   | operator console writes                     | every tick |

The "head pointer" is a Sui shared object — `shell_agent::Head { id, latest_blob: vector<u8>, version: u64 }` — owned by the agent address. Walrus blobs are immutable; the head points at the current strategy_state. Each new write bumps `version` and updates the pointer in one PTB so a crash mid-write doesn't desync.

Optional but recommended: write the previous head's blob id into the new blob's metadata so the journal is a linked list. Past states are forever retrievable.

### Sizes and frequency

- `strategy_state`: ~1–10 KB. Checkpoint on order events + periodic 60s snapshot. ~100–500 writes/day.
- `journal`: ~200 B per entry, append-only. Roll over to a new blob daily, link previous via metadata.
- `config`: ~500 B. Written rarely; agent re-reads each tick.
- `wallet`: ~100 B (encrypted private key blob). Written once.

Walrus epoch handling: every blob has a stake duration. Agent's tick loop checks `epochs_remaining` on every active blob and re-stakes before expiry. Library helper `WalrusClient.extendBlob` (verify exact name when wiring).

## Funding model — own-wallet agent

For v1:

1. User opens the web app, switches to Agent tab, clicks **Create Agent**.
2. Browser generates an Ed25519 keypair, immediately encrypts the secret with Seal under the user's wallet policy, uploads to Walrus → `wallet` blob.
3. Browser shows the agent's address + a "fund me" affordance (QR / copy).
4. User sends SUI (for gas + sell-side collateral) and USDC (for buy-side collateral) to the agent address.
5. Agent process is started (locally or via a hosted runner — see "Deployment" below) and given the agent address + a Walrus access policy.
6. On boot the agent decrypts the wallet blob via Seal, hydrates the keypair in memory, and starts the trigger loop.

Withdrawal: agent runs a `withdraw` action that signs a transfer of all owned coins back to the user's address. Operator console exposes the button.

V2 candidate — `shell::vault` with `AgentCap` so user holds funds and the agent has a revocable spend cap. Out of scope for the hackathon.

## Trigger interface

`shell-agent/src/triggers/Trigger.ts`:

```ts
export interface Trigger {
  name: string;
  evaluate(ctx: TickContext): Promise<Decision | null>;
}

export interface TickContext {
  now: number;             // ms
  state: StrategyState;    // from Walrus
  config: AgentConfig;     // from Walrus
  sui: SuiJsonRpcClient;
}

export type Decision =
  | { kind: "submit"; side: "buy" | "sell"; size: bigint; limitPrice: bigint }
  | { kind: "cancel"; orderId: string }
  | { kind: "wait" };
```

Pluggable. Three triggers worth shipping for the demo:

1. **TimeTickTrigger** — every N seconds, decide based on `state.lastFillPrice` vs a hardcoded target. Always produces a working demo even if Pyth is flaky.
2. **PythDeltaTrigger** — subscribe to a Pyth price feed; on every update, if `abs(price - state.lastPrice) > threshold`, submit a market-style sealed order.
3. **JournalReactTrigger** — re-read recent journal entries from Walrus; if last N trades hit stop-loss, halt for cooldown. Cross-tick state, the Walrus-shaped flex.

Only TimeTickTrigger needs to ship for the day-1 demo. The others can be V1.1.

## Keeper role

Without Seal-in-Nitro, the agent owns the plaintexts of its own orders. To get matches:

1. Agent submits sealed `OrderCommitment`s.
2. Agent watches `OrderSubmitted` events filtered by its own address.
3. When two of its own orders cross (e.g., it placed a sell at 1.95 and later a buy at 2.05 from the same trigger pair), it POSTs both plaintexts to the enclave's `/process_data`.
4. Agent submits the resulting settlement PTB via `settleMatchTx`.

Two agents from the **same operator** (same Walrus access policy) can share plaintext via a private Walrus channel; same operator can match agent-A's sell against agent-B's buy.

Two agents from **different operators** cannot match this way — Seal-in-Nitro is the only path. Documented in [`seal-in-nitro.md`](seal-in-nitro.md).

## Restart-survival demo (the money shot)

Scripted demo sequence:

1. Start agent, wait for first sealed order to land. Show the OrderCommitment on the chain explorer.
2. Show the strategy_state blob fetched from Walrus — print the JSON.
3. **Visibly `kill -9` the agent process.**
4. Wait a beat. Show: the head pointer on-chain hasn't moved. The blob is durable.
5. Start the agent back up. Show it reading the head, fetching the blob, hydrating in-memory state, resuming the trigger loop, and the next order goes out with the right `state.lastFillPrice` from before the crash.

That single sequence is the entire Walrus story.

## UI in `web/`

New top-level tab: **Manual / Agent**. Existing flow stays under Manual.

Agent tab has three panes:

- **Setup wizard** — Create Agent, fund flow, wallet blob upload status, "start daemon" instructions (URL to copy + paste into a hosted runner, or run-locally Docker command).
- **Live state** — pulled from the latest Walrus blob via the head pointer. Fields: open positions, P&L, last decision, trigger config, journal feed.
- **Controls** — pause/resume, withdraw, rotate keypair (writes a new wallet blob, refunds old address into new).

The existing operator console pages under [`web/src/app/(dashboard)/operator/`](../web/src/app/(dashboard)/operator/) probably absorb most of this layout.

## Deployment

Two paths:

1. **Local Node process** — `cd shell-agent && npm run start --agent <addr> --policy <walrus_policy_id>`. Trader runs it on their own machine. Persistent state on Walrus means restarts are clean.
2. **Hosted runner** — a docker image we publish. Trader spins it up on Fly.io / Render / their VPC. Same env vars.

Either way the agent's secrets stay encrypted at rest (Walrus blob, Seal-policy-gated) and only decrypt inside the running process's memory.

## Bounty stack reinforcement

- **DeFi & Payments (main track)**: Shell serves human + agent. The same primitives. Strong PTB composition story strengthens.
- **Walrus**: Shell-Agent is the long-running stateful workflow. Strategy state, journal, wallet blob, config — all four "agentic memory" archetypes the track problem statement names.
- **Pyth (optional)**: oracle for `PythDeltaTrigger`. Cheap bolt-on.
- **Enoki (optional)**: zkLogin for the user wallet that owns the agent setup flow.

## Scope

Day 1:
- `shell-agent/` Node daemon skeleton.
- Wallet blob (Walrus put + Seal encrypt under user policy).
- `strategy_state` blob + head pointer on-chain.
- TimeTickTrigger.
- Keeper role (own-orders matching).
- End-to-end: agent submits two crossing orders against itself, matches via the enclave, settles, journals.

Day 2:
- Web Agent tab: setup wizard, live state pane, controls.
- Kill / restart demo sequence rehearsed.
- Withdraw flow.

Day 3 (stretch):
- PythDeltaTrigger.
- JournalReactTrigger.
- Demo video.

## Risks called out

- **Walrus testnet publisher latency**: blob put can take seconds. Trigger loop must not block waiting for state writes — fire-and-forget with a retry queue.
- **Head-pointer race**: two concurrent writes from agent + operator console need optimistic versioning. PTB checks `head.version == expected` before updating.
- **Single-enclave-instance**: all agents share the one Nitro EC2 today. Fine for demo, not for prod load.
- **Agent address visibility**: orders are private but the submitting address is public. Operators wanting privacy across agents need to rotate keypairs (V1.1 — `rotate` button writes a new wallet blob + refunds).

## What this does **not** cover

- Multi-operator cross-matching (Seal-in-Nitro — separate doc).
- Real DeepBook settlement leg (week-4 work — out of scope here).
- LLM-powered triggers — possible bolt-on but not required by the Walrus track.
- Production-grade key management (HSM / MPC) — V2.

## Open questions for whoever builds this

1. Pick the strategy_state schema concretely before day 1 — start dumb (a few fields), grow.
2. Should the journal blob be a single rolling file or one per day? Rolling per day makes Walrus epoch handling cleaner.
3. Does the head pointer live on a Sui shared object, or as a dynamic field on the user's wallet's profile object? Shared object is simpler.
4. Operator console authentication — does the human user need to sign each operator action, or do we trust the browser session?

Pin these before writing the daemon.
