# Shell Finance — 5-minute demo

**Budget:** 2:00 deck + 2:30 live demo + 0:30 close/Q&A buffer.

Architecture diagram: [`architecture.png`](architecture.png) (source: [`architecture.d2`](architecture.d2)).

---

## Section 1 — Deck (2:00, 5 slides × ~24s)

### Slide 1 · Title (0:00 → 0:15)

**On screen:** "Shell Finance" + chips: *Seal-encrypted · Enclave-matched · Atomic P2P*.

**Voice:**
> Shell Finance. Confidential dark pool on Sui. Sealed intent, enclave matching, atomic peer-to-peer settlement.

### Slide 2 · Problem (0:15 → 0:35)

**On screen:** open eye (red) vs lock (cyan). Caption: *TradFi has dark pools. DeFi didn't.*

**Voice:**
> Every on-chain order leaks. Side, size, limit — public the second you submit. MEV bots front-run. Whales fade. TradFi solved this with dark pools decades ago. DeFi never did.

### Slide 3 · Architecture (0:35 → 1:25) — hero slide

**On screen:** `architecture.png` cropped to chain + enclave strip.

**Voice:**
> Four primitives. Trader encrypts client-side with Mysten Seal — threshold IBE, Move-policy access. Ciphertext goes to Walrus. Only a commit hash and locked collateral hit Sui. AWS Nitro enclave watches for new orders, requests the Seal key — only released if PCR measurements match what we registered on-chain. Decrypts, matches price-time priority, signs. One PTB consumes both order commitments, crosses collateral peer-to-peer, mints receipts. Either both sides settle or nobody does. Price reference: DeepBook, Pyth, fixed NAV — witness only, never a settlement venue. Pre-match everything sealed. Post-settle, original limit and slippage stay sealed forever.

### Slide 4 · Shipping today (1:25 → 1:45)

**On screen:** 3 cols — Move pkg · SDK · Agent. Mono strip: `npx shell-agent run`.

**Voice:**
> Shipping today. Move package on testnet — `settle_v3`, 0.1% fee, buyer price-improvement refund. TypeScript SDK on npm. Headless LLM agent on npm — BYO model, plugin folder, MCP for any external server.

### Slide 5 · Demo handoff (1:45 → 2:00)

**On screen:** "Demo →" + QR + URL.

**Voice:**
> Two minutes of slides. Let me show you it working.

→ **Cut to live machine.**

---

## Section 2 — Live demo (2:30, 6 beats × ~25s)

### D1 · Wallet + UI (2:00 → 2:25)

**Action:** open `shell-finance.vercel.app`, connect wallet, pair selector = SUI/USDC.

**Voice:**
> Standard Sui wallet via dapp-kit. Pair SUI/USDC. Could be any base/quote — RWA pairs like USDY work identically.

### D2 · Sealed order (2:25 → 2:50)

**Action:** place 1 SUI buy at 2 USDC limit. Devtools docked right showing PTB payload.

**Voice:**
> Placing a 1 SUI buy at 2 USDC limit. Watch the devtools — this is the payload hitting chain. Sealed envelope. Nothing about size, price, or side is visible. Just a commit hash and collateral lock.

### D3 · Enclave matches (2:50 → 3:15)

**Action:** switch to operator dashboard tab. `MatchProposed` event lands. (Pre-staged IOI ensures match within 15s.)

**Voice:**
> Enclave just decrypted under the PCR-gated Seal key. Found a counterparty. Match proposal ready.

### D4 · Settlement (3:15 → 3:40)

**Action:** click accept. Suiscan tab opens. Show settlement tx, both `OrderCommitment`s consumed, two `SettlementReceipt`s minted.

**Voice:**
> Single PTB. Atomic. Both orders consumed. Filled size and filled price now public. Original limit and slippage tolerance? Still sealed. Forever.

### D5 · Agent terminal (3:40 → 4:05)

**Action:** split screen — left: terminal running `npx shell-agent run`. Show LLM log: `get_ref_price` → policy check → IOI posted.

**Voice:**
> Now the headless agent. Every 15 seconds the LLM runs a tool-use loop. Pulled reference price from Pyth. Checked risk cap. Policy says accumulate. Picked side, size range, price range, TTL, posted an encrypted IOI.

### D6 · Agent accept (4:05 → 4:30)

**Action:** next tick — `MatchProposed` arrives, LLM decision JSON shows `accept_match`, settlement tx digest scrolls.

**Voice:**
> Second tick. Enclave returned a proposal. LLM: agreed price inside range, balance sufficient, accept. Settlement digest right there. BYO LLM — OpenAI, Anthropic, Google, any OpenAI-compatible. Plugin folder for custom tools. MCP for any external server.

---

## Section 3 — Close (4:30 → 5:00)

**Action:** flip back to slide 5.

**Voice:**
> Three things. Testnet live now. SDK and agent on npm today. Mainnet next. Shell Finance. Confidential by construction. Thanks.

→ Q&A buffer until 5:00.

---

## Pre-flight checklist (24h before)

- [ ] Pre-fund 2 wallets — SUI/USDC + TBILL/USDC pairs
- [ ] Pre-stage 1 standing IOI so D3 match lands within 15s tick
- [ ] Record backup video of D1–D6 happy path (mp4, full-screen)
- [ ] Browser: zoom 125%, dark theme, bookmarks hidden, devtools docked right
- [ ] Agent `.env`: short readable `AGENT_POLICY`, `SHELL_AGENT_LOG=info`
- [ ] Suiscan tab pre-opened, signed in
- [ ] Slide deck full-screen + presenter view on second monitor
- [ ] QR code generated: `npx qrcode "https://shell-finance.vercel.app/" -o docs/slide5_qr.png -e H -s 16`
- [ ] Dry run × 3 with stopwatch — target 1:55 deck, 2:25 demo

## Risk hedges

| Risk | Fallback |
|---|---|
| DeepBook RPC flake | Switch pair selector to USDY/USDC (Pyth) pre-demo |
| Walrus 404 noise | Already silenced unless `SHELL_AGENT_LOG=debug` |
| Enclave proposal latency | Stage IOI before slide 4 ends → match lands during D3 |
| Network drop | Cut to backup mp4 at 2:00, narrate live |
| Wallet popup blocked | Use Chrome (not Brave / arc), test signer pre-demo |

## Catchy hooks (pick one for slide 1 if title bores)

- "Your orderbook is a free signal to every MEV bot. Shell encrypts it."
- "TradFi has dark pools. DeFi doesn't. Until now."
- "Seal-encrypted intent. Enclave matching. Atomic P2P. One PTB."

---

## NotebookLM deck prompt

Paste into NotebookLM after attaching:
- `shell-agent/README.md`
- `ts-sdk/README.md`
- `product.md` §1–5
- `docs/architecture.png`
- this file

````
Create a 5-slide pitch deck for "Shell Finance — confidential dark
pool on Sui." Built for a 2-MINUTE spoken pitch (24s per slide max),
followed by a separate live demo. Slides must be glanceable in 5
seconds, NOT read aloud. Audience: crypto-native technical judges.

Hard rules:
- Max 15 words per slide except slide 3.
- No bullets longer than 5 words.
- No paragraphs. No prose. Headline + visual + 1 callout max.
- Dark theme. Bg #0A0E1A. Fg #E6EDF3. Accent #00D4FF.
- All code/install lines in JetBrains Mono.
- Every footer: "Shell Finance · Sui Overflow 2026" small.
- 16:9.

Slides:

SLIDE 1 — Title
- Headline: "Shell Finance"
- Subhead: "Confidential dark pool on Sui"
- 3 chips: "Seal-encrypted · Enclave-matched · Atomic P2P"
- Footer URL + GitHub

SLIDE 2 — Problem
- Headline: "Every on-chain order leaks"
- Side-by-side icons only:
    LEFT  "Public CLOB"    open eye, red
    RIGHT "Shell envelope" lock, cyan
- Caption strip: "TradFi has dark pools. DeFi didn't."

SLIDE 3 — Architecture (hero)
- Headline: "Four primitives. One atomic settlement."
- Use the attached architecture.png as the central visual
- Side rail: "Price: DeepBook · Pyth · fixed NAV (witness only)"
- Bottom mono strip: "pre-match: sealed · post-settle: limit + slippage stay sealed"

SLIDE 4 — Shipping today
- Headline: "Live now"
- 3 columns:
    Move pkg    "settle_v3 · 0.1% fee · price-improve refund"
    TS SDK      "@shell-finance/sdk"
    Agent       "@shell-finance/shell-agent · BYO LLM"
- Mono strip: "npx shell-agent run"

SLIDE 5 — Demo handoff
- Headline: "Demo →"
- Large QR → shell-finance.vercel.app (home)
- URL + GitHub small below
- Single line: "Testnet live · Mainnet next"

No stock photos. No emojis. No gradient blobs. Architecture slide is
the only dense one.
````
