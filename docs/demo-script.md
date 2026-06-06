# Shell Finance — 5-minute demo

**No slide deck.** Architecture image is the intro. Then split-screen the two access points.

**Budget:** 0:30 intro · 1:45 UI path · 1:45 terminal path · 0:30 close · 0:30 buffer.

**Single thesis to hammer:**
> One protocol. Two access points. Both powered by the same trio — `@shell-finance/sdk`, Walrus MCP, and the Shell agent runtime.

Architecture image: [`assets/architecture.png`](../assets/architecture.png).

---

## Intro (0:00 → 0:30) — architecture fullscreen

**Action:** open `assets/architecture.png` fullscreen on second monitor or `Cmd+Shift+F` in Preview.

**Voice (30s, walk the image left → right):**
> Shell Finance — confidential dark pool on Sui. Every public orderbook leaks intent. We sealed it. Traders Seal-encrypt orders client-side. Walrus stores the ciphertext. Only a commit hash and locked collateral hit Sui. A Nautilus enclave decrypts under PCR-gated keys inside an AWS Nitro TEE, matches against Pyth and DeepBook price witnesses, and signs a hot-potato match instruction. One PTB settles atomically peer-to-peer. Pre-trade privacy. On-chain receipts. Zero operator trust.
>
> One protocol. **Two access points.** A web UI for human traders. A headless terminal for quants. Both ride the same TypeScript SDK, the same Walrus MCP server, and the same Shell agent runtime. Watch.

→ **Cut to laptop.**

---

## Path A — Web UI (0:30 → 2:15) · 4 beats × 25s

> Framing: "First, the human path. **Two pages — IOI Desk for signaling, Terminal for execution.** Same SDK, same Seal, same Sui."

### A1 · IOI Desk — signal interest (0:30 → 0:55)

**Action:** `shell-finance.vercel.app/desk`. Connect Sui wallet. Pair SUI/USDC. Click **IOIs** tab → post IOI form. Side BUY, size range 1–3 SUI, price range 0.95–1.05, TTL 60min. Submit.

**Voice:**
> The IOI Desk. Signal interest privately — Seal-encrypted indication of side, size range, price range. No collateral lock, no commitment. The enclave watches this surface for overlapping intent. Submitted. Sealed envelope sitting in Walrus, only a commit hash on-chain.

### A2 · Terminal — sealed execution order (0:55 → 1:20)

**Action:** nav to `/terminal`. Devtools docked right. Sealed Order Form — 1 SUI buy at 2 USDC, 0.5% slippage. Submit.

**Voice:**
> Terminal page. Same SDK, harder commitment. 1 SUI buy at 2 USDC, half a percent slippage. SDK Seal-encrypts the BCS plaintext client-side. Watch the network tab — sealed envelope, commit hash, real collateral locked. Nothing about size, price, or side is in the clear.

### A3 · Match Proposals tab — proposal lands (1:20 → 1:45)

**Action:** back to `/desk` → **Match Proposals** tab. `MatchProposed` event lands (pre-staged counterparty).

**Voice:**
> Back to the Desk. Match Proposals tab. Enclave decrypted under the PCR-gated Seal key, scanned its book, found a counterparty whose IOI overlaps our order. Proposal published as a Walrus blob, `MatchProposed` event on-chain. Match ID, fill price, fill size — visible only to the two matched traders.

### A4 · Accept → atomic settlement (1:45 → 2:10)

**Action:** click **Accept**. Suiscan tab. Show settlement tx — both `OrderCommitment`s consumed, two `SettlementReceipt`s minted, balances flipped.

**Voice:**
> Accept. Single PTB. `verify_v2` checks the enclave signature against the registered PCR set, produces a hot-potato `MatchInstruction`. `settle_v3` consumes it atomically with both order commitments, crosses collateral peer-to-peer, deducts the 0.1% fee, mints two receipts. Filled size and price now public. Original limit and slippage tolerance? Sealed forever.

---

## Path B — Terminal (2:15 → 4:00) · 4 beats × 25s

> Framing: "Same protocol. Different driver. This is the quant path."

### B1 · One-line start (2:15 → 2:40)

**Action:** terminal — short `.env` visible (4 vars max), then `npx shell-agent run`.

**Voice:**
> Same wallet would work. Different operator. `npx shell-agent run`. Bring your own LLM key — OpenAI, Anthropic, Google, anything OpenAI-compatible. Write your trading policy in one English paragraph. Plugin folder for custom oracles. `mcp.json` for any external tool server.

### B2 · LLM tool-loop posts IOI (2:40 → 3:05)

**Action:** scroll log. Highlight: `get_ref_price` → `check_risk_cap` → `get_my_recent_iois` → `[ioi] posted blob=...`.

**Voice:**
> Every fifteen seconds the agent runs a bounded tool-use loop against your policy. It just pulled reference price from Pyth, checked the risk cap, scanned its own recent IOIs to avoid stacking, then picked side, size range, price range, TTL. Seal-encrypted the IOI envelope. Posted to Walrus through our MCP server. All inside the loop.

### B3 · MCP + Walrus surface (3:05 → 3:30)

**Action:** split pane — show `mcp.json` snippet on left, terminal log on right with `mcp__walrus__put` or `walrus.put` call.

**Voice:**
> That Walrus call goes through our MCP server — eleven typed tools — `put`, `get`, `status`, `put_quilt`, head pointers, MemWal. Same server any LLM agent can hit. Public HTTPS endpoint, no install. The Shell agent is just the first consumer.

### B4 · Agent accept + settle (3:30 → 3:55)

**Action:** next tick — `MatchProposed` arrives. LLM decision JSON: `{"decision":"accept_match","policy_check":true}`. Settlement tx digest scrolls. Click into suiscan.

**Voice:**
> Second tick. Enclave returned a proposal for our IOI. LLM evaluates — agreed price inside range, balance sufficient, policy check passes — accept. SDK builds the settlement PTB, signs it, submits. Same `settle_v3` path the UI used. Same receipts. No human in the loop.

---

## Close (4:00 → 4:30) — back to architecture image

**Action:** flip back to fullscreen architecture.

**Voice:**
> One protocol. Two access points. Three primitives — Seal, Nautilus, Walrus. All composed inside a single atomic PTB. Testnet live now. SDK and agent on npm today. Mainnet next. Shell Finance — confidential by construction. Thanks.

→ **Q&A buffer 4:30 → 5:00.**

---

## Pre-flight checklist (24h before)

- [ ] Pre-fund 2 wallets — SUI/USDC + TBILL/USDC pairs
- [ ] Pre-stage 1 standing IOI so A3 + B4 matches land within 15s tick
- [ ] Record backup mp4 of A1–A4 + B1–B4 happy paths
- [ ] Browser: zoom 125%, dark theme, bookmarks hidden, devtools docked right
- [ ] Agent `.env`: short readable `AGENT_POLICY`, `SHELL_AGENT_LOG=info`
- [ ] `mcp.json` snippet pre-opened in second tab
- [ ] Suiscan tab pre-opened, signed in
- [ ] Architecture image opened fullscreen on second monitor
- [ ] QR generated (already done): `assets/slide5_qr.png` (or `docs/slide5_qr.png`)
- [ ] Dry run × 3 with stopwatch — target 0:25 intro, 1:40 each path, 0:25 close

## Risk hedges

| Risk | Fallback |
|---|---|
| DeepBook RPC flake | Switch pair selector to USDY/USDC (Pyth) pre-demo |
| Walrus 404 noise | Already silenced unless `SHELL_AGENT_LOG=debug` |
| Enclave proposal latency | Stage IOI before intro ends → A3 + B4 lands during demo |
| Network drop | Cut to backup mp4 at 0:30, narrate live using script |
| Wallet popup blocked | Use Chrome (not Brave/arc), test signer pre-demo |
| LLM provider rate limit | Pre-cache `.env` with low-latency provider (Anthropic Haiku or OpenAI mini) |

## Q&A one-liners

| Question | Answer |
|---|---|
| "How are fees handled across all the new pairs?" | "Flat 10 bps each side, paid in the pair's quote coin. Multi-pair didn't change the model — the Move package is generic over `<TBase, TQuote>` and the fee math uses signed `base_decimals`. Per-pair tiering is a post-hackathon governance question." |
| "Can same trader match self?" | "Blocked at 4 layers — Move asserts in `settle_v2/v3/v4`, enclave skips silently, SDK throws client-side, Move tests cover both paths. Cross-address wash is a residual — out of protocol scope, consumer KYC layer." |
| "Why not allow tokens with no price source?" | "Fairness guarantee. Matcher needs a reference mid to validate cross. Limit-only mode for unlisted coins weakens that — deferred." |

## Tagline options (intro hook, pick one)

- "One protocol. Two access points. Both seal your intent before chain ever sees it."
- "Your orderbook is a free signal to every MEV bot. Shell encrypts it."
- "TradFi has dark pools. DeFi didn't. Until now."
- "Seal-encrypted intent. Enclave matching. Atomic P2P. One PTB."

---

## NotebookLM source bundle (for backup deck if needed)

Attach:
- `shell-agent/README.md`
- `ts-sdk/README.md`
- `README.md` (project root)
- `assets/architecture.png`
- this file
