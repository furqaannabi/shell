# Demo cheat card

> Print A5. Tape to laptop. Time-budget per beat in left col.

## Timing rail

```
0:00 ──┬── S1 title         "dark pool on Sui"
0:15 ──┼── S2 problem       "every order leaks"
0:35 ──┼── S3 architecture  ← hero, 50s
1:25 ──┼── S4 shipping      "npx shell-agent run"
1:45 ──┼── S5 demo →        cut to laptop
─────────────────────────────────────────────
2:00 ──┬── D1 wallet        connect, pair SUI/USDC
2:25 ──┼── D2 sealed order  1 SUI buy @ 2 USDC, devtools open
2:50 ──┼── D3 match lands   switch to ops dashboard
3:15 ──┼── D4 settlement    accept → suiscan tab
3:40 ──┼── D5 agent         terminal split, LLM log
4:05 ──┼── D6 agent accept  2nd tick, accept_match JSON
─────────────────────────────────────────────
4:30 ──┼── close            slide 5 + "mainnet next"
4:40 ──┴── Q&A
5:00 ── END
```

## One-line per beat (read at glance)

| Beat | Line |
|---|---|
| S1 | "Confidential dark pool on Sui. Sealed intent, enclave matching, atomic P2P." |
| S2 | "Every on-chain order leaks. MEV bait. TradFi solved this — DeFi never did." |
| S3 | "Encrypt with Seal. Store on Walrus. Nitro decrypts under PCR-gated key. One PTB settles." |
| S4 | "Move pkg, SDK, agent — all live. `npx shell-agent run`." |
| S5 | "Two minutes of slides. Let me show you it working." |
| D1 | "Standard Sui wallet. Dapp-kit." |
| D2 | "This is what hits chain. Sealed bytes. Commit hash + collateral." |
| D3 | "Enclave decrypted under PCR-gated key. Counterparty found." |
| D4 | "One PTB. Atomic. Original limit + slippage sealed forever." |
| D5 | "Headless agent. LLM tool-loop. Plugin + MCP." |
| D6 | "Second tick. Accept. Settled. No human." |
| End | "Testnet live. SDK + agent on npm. Mainnet next. Thanks." |

## Hotkeys

| Key | Action |
|---|---|
| `Cmd+→` / `Cmd+←` | Deck nav |
| `Cmd+1` | Browser → trader UI |
| `Cmd+2` | Browser → ops dashboard |
| `Cmd+3` | Browser → suiscan |
| `Cmd+~` | Terminal cycle |

## URLs to pre-open

- https://shell-finance.vercel.app/ (trader)
- https://shell-finance.vercel.app/ops (operator dashboard)
- https://suiscan.xyz/testnet/account/<your-addr>
- https://npmjs.com/package/@shell-finance/shell-agent

## Terminal pre-run

```bash
# tab 1 — agent (start BEFORE deck)
cd ~/demo && npx shell-agent run

# tab 2 — backup post-ioi
cd ~/demo && npx shell-agent post-ioi

# tab 3 — env reload if drift
source .env && env | grep AGENT_
```

## Fallback (network drop)

1. Hit `F` → fullscreen backup mp4
2. Narrate over it using D1–D6 lines above
3. Skip suiscan link, point at receipt count on screen

## Pair swap (DeepBook flake)

In trader UI: pair selector top-right → **USDY/USDC** (Pyth). All other beats identical.

## Numbers to remember (if asked)

| Q | A |
|---|---|
| Protocol fee | 0.1% per side, paid in quote |
| Match tick | 15s default (agent), enclave continuous |
| Settlement atomicity | hot-potato `MatchInstruction` consumed same PTB |
| Privacy post-settle | filled size + price public, original limit + slippage sealed |
| LLM providers | OpenAI, Anthropic, Google, any OpenAI-compatible |
| Network | testnet (mainnet next) |
| Enclave | AWS Nitro, PCR-pinned, reproducible Marlin Oyster build |
| Price sources | DeepBook (SUI/USDC), Pyth (USDY/RWA), fixed NAV (TBILL) |

## DON'T

- Don't read slides aloud — they're glance-cards
- Don't open inspector during D5/D6 (mic shows API keys)
- Don't switch to dark/light mid-demo
- Don't `cd` out of `~/demo` (loses plugins/mcp.json)
- Don't apologize for testnet — frame as "live now"
