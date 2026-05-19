# AI execution agent — design (2026-05-19)

Layered on top of `agent-mode.md` (the headless trading daemon) and `walrus-agent-tooling.md` (the MCP layer). This doc adds the **LLM-in-the-loop** decision layer that lets institutional traders express intent in natural language, discover counterparties privately, and execute large orders intelligently — with every agent decision auditable on Walrus.

The Walrus track problem statement is "AI agents and agentic workflows powered by Walrus as a verifiable data and memory layer." This design uses Walrus as exactly that: durable, verifiable storage for declared trading policies, encrypted indications of interest, agent reasoning trails, and post-trade audit records.

## What problems this solves

Three institutional pains that Shell's manual trader surface doesn't address.

**D — Private counterparty discovery.** Today, an institution wanting to move a block trade either (a) posts to a public orderbook and leaks intent, or (b) uses an OTC desk and trusts a centralized middleman. Both options are bad. Shell can match orders confidentially *once both sides have posted* — but the discovery problem (how do those two traders find each other in the first place?) is outside Shell's scope today.

**C — Intelligent block execution.** A trader who wants to "sell 10M SUI over 4 hours without moving the price more than 2 bps" currently needs an algo desk or custom code. Slicing strategy, timing, and post-trade transaction-cost-analysis (TCA) are all manual.

**B — Black-box trust gap.** Compliance officers and auditors won't approve an algorithmic execution agent without a way to verify it followed declared policy. Reasoning logs in a SaaS dashboard are not enough — the audit trail must be tamper-evident.

## What we're building — two user-facing features

### Feature 1 — Sealed IOI exchange (solves D)

Traders post encrypted "indications of interest" (IOIs) to a Walrus namespace. The Shell enclave is the **only** entity that can decrypt them. It runs an internal matching pass and writes per-side match proposals back to Walrus, encrypted to each respective trader. The matched parties then submit normal Shell sealed orders with pre-aligned terms.

Critically: even other traders authorized to *post* IOIs cannot *read* anyone else's. The trust model is identical to Shell's existing order matching — the enclave is the only oracle.

### Feature 2 — Block execution agent (solves C)

Trader gives a parent intent ("sell 10M SUI over 4 hours, max 2 bps impact"). An LLM agent slices the order into child orders, times their submission against the DeepBook price reference, and submits each as a normal sealed Shell order. After completion, the LLM generates a TCA report from the journal: realised price vs benchmark, slippage per child, decision rationale per slice.

### Audit trail (solves B) — baked into both

Every LLM decision in either feature writes a structured reasoning blob to a Walrus journal namespace, linked to the trader's declared policy by hash. The policy itself is hash-committed on-chain at agent creation. Anyone with read access can walk the chain: policy → decisions → trades → fills.

This is not a separate feature. It's how Features 1 and 2 are implemented.

## Architecture

```
┌─ Trader (web UI) ─────────────────────────────────────────────────────┐
│  ┌─ Policy authoring ──┐  ┌─ IOI dashboard ──┐  ┌─ Block intent ──┐  │
│  │  NL → structured    │  │  My IOIs +       │  │  Parent order   │  │
│  │  policy + on-chain  │  │  match proposals │  │  + slicing live │  │
│  │  hash commitment    │  │                  │  │                 │  │
│  └─────────┬───────────┘  └────────┬─────────┘  └────────┬────────┘  │
└────────────│────────────────────────│─────────────────────│──────────┘
             │                        │                     │
             ▼                        ▼                     ▼
       ┌─ shell-agent (Node daemon, per agent-mode.md) ────────────────┐
       │   ┌─ LLM orchestrator (Claude API) ──────────────────────┐    │
       │   │   compile NL policy / draft IOI / evaluate matches / │    │
       │   │   slice block / annotate every decision              │    │
       │   └──────────────────────────────────────────────────────┘    │
       │   ┌─ Walrus IO (via @mysten/walrus) ─────────────────────┐    │
       │   │   write IOI ciphertext, journal entries, TCA reports │    │
       │   │   read match proposals, policy blob, peer signals    │    │
       │   └──────────────────────────────────────────────────────┘    │
       │   ┌─ Shell SDK ──────────────────────────────────────────┐    │
       │   │   encryptOrder / submitOrderTx / cancelOrderTx       │    │
       │   └──────────────────────────────────────────────────────┘    │
       └────────────────────────┬──────────────────────────────────────┘
                                │
              ┌─────────────────┴───────────────────┐
              ▼                                     ▼
    ┌─ Walrus ─────────────────┐         ┌─ Shell Enclave (Nautilus) ──┐
    │  iois/<ts>-<addr>        │ ◄────── │  poll IOI namespace          │
    │     ciphertext           │         │  decrypt in TEE              │
    │  matches/<addr>/<id>     │ ──────► │  match against open IOIs     │
    │     proposal (Seal'd)    │         │  write match proposal blobs  │
    │  journal/<agent>/<day>   │ ◄────── │  (existing) match orders     │
    │     reasoning entries    │         └──────────────────────────────┘
    │  policy/<agent>          │
    │     committed strategy   │
    └──────────────────────────┘
```

## Walrus blob roles (extends `agent-mode.md`)

New blob roles added by this design. Existing roles (`wallet`, `strategy_state`, `journal`, `config`) from `agent-mode.md` are unchanged.

> Notation: `<agent_id>` throughout this doc is the agent's Sui address (each agent has its own keypair per `agent-mode.md`).

| Namespace | Role | Written by | Read by | Encryption |
|---|---|---|---|---|
| `policy/<agent_id>` | Declared trading policy (NL + compiled struct). Hash committed on-chain. | Trader, via web UI | Trader, enclave (verify), auditors | Plain (or Seal-gated if private) |
| `iois/<ts>-<agent_id>` | Indication of interest (side, asset, size range, price range, expiry, agent address) | Trader's agent | Enclave only | Seal — policy `enclave_can_decrypt` |
| `matches/<agent_id>/<match_id>` | Match proposal (counterparty agent address, agreed price, agreed size, **proposal expiry** = deadline to accept) | Enclave | Trader's agent only | Seal — policy `recipient_can_decrypt` |
| `journal/<agent_id>/<day>` | Append-only LLM reasoning entries: input snapshot → policy check → output decision | Trader's agent | Trader, auditors | Plain (or Seal-gated if private) |
| `tca/<agent_id>/<parent_id>` | Post-block TCA report (Feature 2): realised vs benchmark, slice-by-slice analysis | Trader's agent (LLM-generated) | Trader, auditors | Plain |

Head pointers (Sui shared objects):

- `PolicyHead { agent_id, latest_blob_id, version, committed_hash }` — version-checked update; `committed_hash` is the SHA-256 of the policy blob at the time of commitment. Verifiable that the policy on Walrus matches what was committed.
- `JournalHead { agent_id, latest_day_blob, prev_day_blob, day_number }` — daily roll-over, walkable backwards.
- `IoiActive { agent_id, blob_id, expiry_ms }` — owned by the agent address; lists the agent's currently-active IOI(s). Deleted on match or expiry.

## Enclave changes

The Nautilus enclave gains a second background task alongside its existing order-matching poller.

```
IOI matcher loop (every N seconds):
  1. list_owned_blobs(namespace="iois/", since=last_checkpoint)
  2. for each new blob:
       ciphertext = walrus.get(blob_id)
       seal.decrypt(ciphertext) -> IoiPlaintext { side, asset, size_lo, size_hi, price_lo, price_hi, expiry, agent_addr }
       insert into in-memory IOI book
  3. run matching algorithm (price-time priority, size overlap):
       for each compatible pair:
         derive agreed_price (midpoint or pro-rated)
         derive agreed_size (min of overlapping ranges)
         build MatchProposal for buy side, sealed to buy_agent_addr
         build MatchProposal for sell side, sealed to sell_agent_addr
         walrus.put each, get blob_ids
         emit on-chain event MatchProposed { buy_agent, sell_agent, buy_proposal_blob, sell_proposal_blob }
  4. delete or mark consumed IOI ciphertexts (or let them expire naturally)
```

The matcher is deterministic given the IOI book. PCR-attested. Same trust model as Shell's existing order matcher.

## Agent decision loop with LLM

For every tick (Feature 2 — block execution) or every poll cycle (Feature 1 — match proposal handling), the agent does:

```
1. Read inputs:
     - latest policy from Walrus (verify hash matches on-chain commitment)
     - current state (open orders, fills, P&L) from agent-mode.md's strategy_state
     - market reference (DeepBook price)
     - any match proposals or peer signals from Walrus

2. Call LLM (Claude API) with a structured prompt:
     System: "You are agent <id>. Your policy is <policy>. Follow it strictly."
     User: "State: <state>. Market: <market>. Decide next action."

3. LLM responds with structured JSON:
     {
       "decision": "submit_order" | "cancel" | "wait" | "post_ioi" | "accept_match" | "reject_match",
       "params": { ... },
       "reasoning": "free text — why this decision follows from policy + state",
       "policy_check": "true|false — does this decision stay within declared bounds?"
     }

4. Validate:
     - If policy_check != true → escalate to human (no auto-execute)
     - If params outside trader's pre-set auto-execute bounds → escalate to human
     - Else → proceed with action

5. Persist:
     - Append { timestamp, inputs_hash, llm_output, validation_result, action_taken } to journal blob
     - Bump JournalHead version on Sui

6. Execute:
     - submit_order / cancel → Shell SDK calls
     - post_ioi → Seal-encrypt + Walrus put + IoiActive head pointer update
     - accept_match → both sides submit Shell sealed orders with proposal terms
```

The structured JSON output is the audit-trail contract. Human-readable `reasoning` next to machine-validated `policy_check` gives auditors both narrative and verifiable answers.

## Tiered execution (humans + auto)

The agent operates in three modes per action type, configurable per policy:

- **Auto** — action proceeds without confirmation. Reasoning logged. Used for: posting low-size IOIs, slicing within parent intent bounds.
- **Confirm** — agent prepares the action, surfaces to UI for one-click approve, executes on approval. Used for: accepting match proposals, executing slices outside pre-approved bounds.
- **Block** — agent never takes this action without explicit operator initiation. Used for: large size limit overrides, policy changes.

Default for v1: auto for slicing within bounds, confirm for match acceptance, block for policy edits. The trader's policy declares per-action thresholds.

## UI surfaces

Three additions to the existing dashboard, scoped under a new "Agent" top-level tab.

1. **Policy authoring** — natural-language editor ("Buy SUI weekly, max 100/week, skip if 7-day return < -10%"). LLM compiles to structured policy. Hash commitment requires wallet signature. Shows the compiled struct alongside the NL for transparency.

2. **IOI dashboard (Feature 1)** — list active IOIs (mine), pending match proposals (mine), and a feed of match outcomes. Each row links to its Walrus blob + reasoning entries.

3. **Block intent (Feature 2)** — parent order form ("sell 10M SUI over 4h, max 2 bps impact"). Live progress: child orders submitted, fills realized, current trajectory vs benchmark. Final TCA report rendered from Walrus on completion.

4. **Audit/journal view (Feature B)** — chronological deliberation log. For each entry: input snapshot, LLM reasoning, validation result, action taken, on-chain links (if any). Filter by policy version, action type, time range. Compliance-officer view.

## Demo scenario — the wow moment

Two browser tabs, two test wallets.

1. **Tab A (sell-side trader)**: opens app, writes NL policy ("DCA out of SUI position, target $200k by end-of-day"), commits to chain. Posts IOI: sell 50k SUI @ ~1.40, expires 30 min.
2. **Tab B (buy-side trader)**: opens app, posts IOI: buy 100k SUI @ ~1.39 - 1.41, expires 1 hr.
3. Enclave's IOI matcher (next tick) decrypts both, finds overlap, posts match proposals.
4. **Tab A**: gets push, sees proposed match: sell 50k @ 1.402 to counterparty `0x4f7...`. LLM has annotated: "matches policy: size within DCA target; price > recent VWAP; counterparty new but reputation-neutral; recommend accept." Trader clicks Approve.
5. **Tab B**: similar match proposal arrives, also accepts.
6. Both wallets submit sealed Shell orders with the agreed terms. Enclave's existing order matcher matches them. DeepBook settles. SettlementReceipts appear in both tabs.
7. **Audit view (both tabs)**: shows the full deliberation chain — policy → IOI reasoning → match evaluation → order submission → fill — every step linked to its Walrus blob.

The judges see: discovery happened privately (no one but the enclave saw the IOIs), execution happened confidentially (Shell's existing flow), and the entire deliberation is on Walrus, verifiable.

## Risks called out

- **LLM latency.** Each decision is a Claude API round-trip (~1-2s). Fine for IOI handling and slicing intervals (>10s). Not fine for sub-second triggers — but those aren't in scope here.
- **LLM cost.** Claude API costs money per call. For a slicing agent making N decisions/hour, this adds up. Use Haiku for routine decisions, escalate to Sonnet for high-value ones. User provides their own API key.
- **LLM hallucination.** Mitigated by `policy_check` validation in structured output + tiered execution (auto only within declared bounds + escalation otherwise). The agent cannot execute outside its declared policy without human override.
- **Enclave IOI matcher scope creep.** Adding IOI matching expands what the enclave does. New attack surface. PCR re-registration required. Coordinated with seal-in-nitro work.
- **Walrus testnet publisher latency.** Same as in `agent-mode.md` — IOI posts and journal writes are async, must not block the decision loop.
- **Cross-IOI front-running by the enclave.** The enclave can see all IOIs. If the enclave is compromised, all IOIs are visible. Same trust assumption as Shell's existing order matching. Mitigated by PCR attestation.
- **Policy hash + Walrus content desync.** If policy blob expires or is replaced without updating PolicyHead, on-chain hash no longer matches Walrus content. Mitigated: PolicyHead update is atomic with the new Walrus write (PTB).
- **No IOI cancellation in v1.** Posted IOIs cannot be retracted; they expire on schedule. Add cancel as v1.1 (signed retraction blob the enclave honors).

## What this does NOT cover

- Replacing Shell's existing order matcher. Feature 1's IOI matcher is a new sibling task on the same enclave.
- Production-grade key management. The agent's Sui keypair stays encrypted on Walrus under the user's Seal policy (per `agent-mode.md`), not in HSM/MPC.
- Cross-trust-circle KYC oracles, identity attestation, or regulatory compliance integrations. Hackathon scope assumes test addresses.
- Auto-execute outside declared bounds. v1 requires either policy update (signed) or human approve-on-the-spot for every out-of-bound action.
- Multi-leg / multi-asset IOIs (e.g., "sell SUI for USDC OR for ETH"). v1 is single-pair.
- Learning loops (LLM reads its own journal and proposes policy adjustments). Out of scope but documented in Open Questions for v2.

## Scope and build order

Day 1 — core pipeline end-to-end on one feature:
- Walrus blob layer for `iois/` and `matches/` namespaces
- Enclave IOI matcher (simplest possible — exact price match, no ranges)
- shell-agent extension: post IOI, react to match proposal
- LLM integration for IOI drafting + match evaluation (Claude API)
- Web UI: IOI dashboard, audit/journal view
- Demo: two tabs, end-to-end match → fill on testnet

Day 2 — feature 2 + polish:
- Block execution agent (slicing logic, TCA report)
- Tiered execution (auto / confirm / block) wired through UI
- Policy authoring UI (NL → compiled struct + hash commitment)
- Demo video rehearsal

Day 3 (stretch):
- Self-improvement loop (LLM reads journal, proposes policy adjustments)
- Multi-pair IOIs
- Reputation tracking per agent address

## Open questions

1. **IOI matching algorithm details.** Strict overlap vs midpoint vs Dutch auction. Pick one for v1 (probably midpoint within overlap range, size = min of ranges).
2. **Match proposal expiry.** How long does a trader have to accept before the enclave releases the IOI back to the pool? 60 seconds seems right for hackathon, longer for production.
3. **Multi-match.** If three IOIs all match, does the enclave pair them pairwise (one match) or attempt a three-way fill? Pairwise for v1.
4. **Reasoning verifiability.** The LLM's `reasoning` is free text — a malicious agent operator could write fake reasoning. Only the `policy_check` machine validation is trustworthy. Document this clearly to auditors. v2: reasoning generation inside enclave for true non-repudiation.
5. **Policy schema.** What's the structured policy actually look like? Start minimal: pair, side preference, size bounds, price bounds, time bounds, escalation thresholds. Grow as needed.
6. **Reputation.** Should the enclave track historical match acceptance / rejection rates per agent and surface to counterparties? Strong incentive but out of scope v1.

## References

- `agent-mode.md` — the headless trading daemon this layer extends
- `walrus-agent-tooling.md` — the MCP server providing LLM-facing Walrus tools
- `seal-in-nitro.md` — relevant if the enclave's IOI matcher uses the same Seal flow
- Walrus track problem statement — Sui Overflow 2026
- Shell `product.md` — protocol-level architecture (Section 5: threat model)
