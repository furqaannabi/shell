# Shell Finance — Sui Overflow 2026 demo

**Format:** pre-recorded screen capture + voice-over. No slides. Demo state pre-staged before recording — narration walks the artifacts on screen.

**Budget (per organizer guidance):** 0:45 problem · 3:00 demo · 0:45 conclusion + future vision · 0:30 buffer. Target 4:30, hard cap 5:00.

**Single thesis:**
> Every public orderbook leaks intent. Shell seals it. One protocol, two access points — web UI and headless agent — both driven by the same SDK, the same Seal-Nautilus-Walrus trio, the same atomic settlement PTB.

Architecture image: [`assets/architecture.png`](../assets/architecture.png).

---

## Problem (0:00 → 0:45)

**Action:** open `assets/architecture.png` fullscreen as backdrop. Voice over the image — do not walk it pipe-by-pipe yet.

**Voice (45s, ~95 words):**
> Public orderbooks leak every order — side, size, price — to every MEV bot on chain. TradFi solved this with dark pools. DeFi didn't. Until now.
>
> Shell Finance is a confidential dark pool on Sui. Orders get Seal-encrypted client-side. A Nautilus enclave matches them inside an AWS Nitro TEE. One PTB settles atomically peer-to-peer. Nothing leaks until after the fill.
>
> One protocol. Two access points — web UI for humans, headless agent for quants. Same SDK underneath. Watch.

→ **Cut to staged demo recording.**

---

## Demo (0:45 → 3:45) — staged state, narrated walk-through

> Framing line at cut: "Trader path first. Then agent path. Same SDK underneath both."

### D1 · IOI Desk — private signaling (0:45 → 1:15) · 30s

**Screen:** `shell-finance.vercel.app/desk`. Pre-posted IOI visible in IOIs tab. Switch to Match Proposals tab — proposal already landed.

**Voice:**
> The IOI Desk. Signal interest privately — Seal-encrypted indication of side, size range, price range. No collateral lock, no commitment. Sealed envelope sits in Walrus, only a commit hash on-chain. Match Proposals tab — enclave decrypted under the PCR-gated Seal key, scanned its book, found a counterparty whose IOI overlaps. Match ID, fill price, fill size — visible only to the two matched traders.

### D2 · Terminal — sealed execution order (1:15 → 1:45) · 30s

**Screen:** `/terminal`. Sealed order already in Active Orders panel. Suiscan tab pre-loaded showing commit hash + sealed envelope bytes on the OrderCommitment object.

**Voice:**
> Terminal page. Harder commitment. SDK Seal-encrypts the BCS plaintext client-side — side, size, limit price, slippage. Collateral locked in the same transaction. Suiscan — commit hash and sealed envelope on chain. Nothing about size, price, or side is in the clear.

### D3 · Atomic settlement (1:45 → 2:15) · 30s

**Screen:** Suiscan tab on the settlement PTB. Show both OrderCommitments consumed, two SettlementReceipts minted. Cut back to Terminal — Settlement Receipts panel with live counter chip incremented.

**Voice:**
> One PTB. `verify_v2` checks the enclave signature against the registered PCR set, produces a hot-potato match instruction. `settle_v3` consumes it atomically with both order commitments, crosses collateral peer-to-peer, deducts the 10 bps fee, mints two receipts. Filled price now public. Original limit and slippage tolerance — sealed forever.

### D4 · Agent runtime — LLM tool-loop (2:15 → 2:55) · 40s

**Screen:** terminal pane with pre-scrolled `shell-agent` log. Highlight in sequence: `get_ref_price` → `check_risk_cap` → `get_my_recent_iois` → `[ioi] posted blob=...` → `MatchProposed` → `{"decision":"accept_match","policy_check":true}` → settlement tx digest.

**Voice:**
> Same protocol, no human. `npx shell-agent run`. Bring your own LLM key — OpenAI, Anthropic, Google, anything OpenAI-compatible. Trading policy in one English paragraph. Every fifteen seconds a bounded tool-use loop — pull reference price from Pyth, check risk cap, scan recent IOIs to avoid stacking, pick side and range, Seal-encrypt, post to Walrus. Next tick — proposal arrives, LLM evaluates against policy, accepts, SDK builds the settlement PTB. Same `settle_v3` path the UI used. Same receipts.

### D5 · MCP surface — reusable infrastructure (2:55 → 3:25) · 30s

**Screen:** split — `mcp.json` snippet on left, log line showing `mcp__walrus__put` on right.

**Voice:**
> That Walrus call goes through our MCP server — eleven typed tools, `put`, `get`, `status`, `put_quilt`, head pointers, MemWal. Public HTTPS endpoint. Any LLM agent hits the same surface. The Shell agent is the first consumer, not the only one.

### Buffer (3:25 → 3:45) · 20s

Catch-up if D1–D5 ran long. Otherwise extend D3 settlement narration.

---

## Conclusion + future vision (3:45 → 4:30)

**Screen:** flip back to fullscreen architecture image.

**Voice (45s):**
> One protocol. Two access points. Three primitives — Seal, Nautilus, Walrus — composed inside a single atomic PTB. Testnet live now. SDK and agent on npm today.
>
> What comes next. Mainnet cutover with a public security audit of the Move package and the enclave. RWA pair expansion — every Pyth feed becomes a tradable confidential pair without a code change. Institutional onboarding through the IOI Desk for size that can't touch public books. And a compliance layer — KYC-gated access, counterparty allowlists, and a verifiable audit trail, the bar regulated RWA desks need to trade at all.
>
> Shell Finance. Confidential by construction. Thank you.

→ **Buffer 4:30 → 5:00.**

---

## Pre-flight checklist (24h before recording)

- [ ] Pre-fund 2 wallets — SUI/USDC pair, both sides
- [ ] Stage 1 IOI + 1 matched proposal pre-recording so D1 lands cleanly
- [ ] Stage 1 sealed order + 1 settlement receipt pre-recording for D2/D3
- [ ] Pre-scroll agent log to the exact tool-loop sequence — trim noise
- [ ] Browser: zoom 125%, dark theme, bookmarks hidden
- [ ] Suiscan tabs pre-opened on the staged settlement tx + sealed order object
- [ ] `mcp.json` snippet pre-opened in second tab
- [ ] Architecture image opened fullscreen on second monitor
- [ ] QR generated: `assets/slide5_qr.png` (or `docs/slide5_qr.png`)
- [ ] Voice-over dry run × 3 with stopwatch — 0:45 / 3:00 / 0:45 splits
- [ ] Backup mp4 of staged demo in case live screen capture drops frames

## Risk hedges

| Risk | Fallback |
|---|---|
| Live screen capture stutter | Pre-recorded mp4 of the staged walk-through |
| Voice-over flubs | Re-record audio track only, re-mux over the screen capture |
| Architecture image cropping on judge displays | Export 1920×1080 still, embed in mp4 head and tail |
| Pacing drift | 20s buffer at end of demo block absorbs overruns |
| Audio clipping | Monitor levels, target -12dB peak |

## Q&A one-liners (for judging round, not video)

| Question | Answer |
|---|---|
| "How are fees handled across all the new pairs?" | "Flat 10 bps each side, paid in the pair's quote coin. Multi-pair didn't change the model — Move package is generic over `<TBase, TQuote>` and fee math uses signed `base_decimals`. Per-pair tiering is a post-hackathon governance question." |
| "Can same trader match self?" | "Blocked at 4 layers — Move asserts in `settle_v2/v3/v4`, enclave skips silently, SDK throws client-side, Move tests cover both paths. Cross-address wash is residual — out of protocol scope, consumer KYC layer." |
| "Why not allow tokens with no price source?" | "Fairness guarantee. Matcher needs a reference mid to validate cross. Limit-only mode for unlisted coins weakens that — deferred." |
| "Sui-specific value?" | "Hot-potato `MatchInstruction` is load-bearing — only Sui's object model enforces the consume-in-same-PTB invariant atomically. Plus Nautilus PCR registration on-chain ties enclave identity to Move state. Neither pattern lifts cleanly to other chains." |
| "User testing?" | "Three MVP iterations driven by testnet feedback — multi-pair auto-discovery, IOI Desk for soft signaling, headless agent runtime. Each shipped before this submission." |

## Tagline options (intro hook, pick one)

- "Every public orderbook leaks intent. Shell seals it."
- "TradFi has dark pools. DeFi didn't. Until now."
- "Seal-encrypted intent. Enclave matching. Atomic P2P. One PTB."
- "One protocol. Two access points. Zero leaked intent."

---

## NotebookLM source bundle (for backup deck if needed)

Attach:
- `shell-agent/README.md`
- `ts-sdk/README.md`
- `README.md` (project root)
- `assets/architecture.png`
- this file
