# RWA integration — confidential execution for tokenized real-world assets

Shell's pitch generalises beyond crypto-native pairs. The same Seal + Nautilus + atomic-settle stack works for **tokenized real-world assets** (RWAs) already live on Sui: tokenized treasuries, money-market funds, private credit, yield-bearing stables. Institutions trading these size-sensitive instruments want exactly what Shell ships — pre-trade privacy, attested matching, auditable settlement.

This doc scopes how Shell plugs into Sui's RWA ecosystem without changing the protocol's invariants.

## Why RWAs are a strong fit

Three things make RWAs the better long-term market than spot crypto for Shell:

1. **Institutional flow is size-sensitive by default.** A $20M USDY block trade leaks if it hits a public CLOB. The same trader on a public DEX moves the price against themselves. Confidential pre-trade state is table stakes for traditional finance — Shell delivers it cryptographically rather than via dark-pool operators.
2. **RWA issuers already enforce eligibility on-chain.** Ondo, Franklin, Libre all gate transfers via Move `TransferPolicy` rules (allowlists, KYC attestations, jurisdiction checks). Shell doesn't fight that — the enclave matcher only proposes matches; settlement runs the policy-gated PTB exactly like a normal transfer. No bypass, no new attack surface.
3. **Audit trail is mandatory, not nice-to-have.** Regulated institutions need provable execution records. Shell already writes `SettlementReceipt` objects per fill; combined with the Walrus journal from [`ai-execution-agent.md`](ai-execution-agent.md), every decision + match + fill is permanently retrievable and verifiable. This is compliance-grade out of the box.

## Sui RWA inventory (assets Shell could list)

| Asset | Issuer | Type | Status on Sui | Notes |
| --- | --- | --- | --- | --- |
| USDY | Ondo Finance | Tokenized US Treasuries (yield-bearing) | Live mainnet | Whitelisted holders only |
| BENJI | Franklin Templeton | Tokenized money market fund (FOBXX share) | Live mainnet | Regulated 1940-Act fund |
| Libre funds | Libre Capital | Hedge funds, private credit | Live mainnet | Accredited investors only |
| USDM | Mountain Protocol | Yield-bearing stablecoin | Live mainnet | Permissioned |
| USDC | Circle | Stablecoin (quote leg) | Live mainnet | Standard quote |

Quote leg = USDC for all pairs. Base legs = the RWAs above. All hold-eligibility checks run on the **base** side via `TransferPolicy`.

## Architecture deltas vs crypto-native flow

Shell's existing flow:

```
Trader → Seal-encrypt order → submit OrderCommitment<Base, Quote>
       → enclave decrypts, matches → MatchInstruction (hot potato)
       → PTB: consume MatchInstruction + cross collateral + SettlementReceipts
```

RWA flow adds **one** step:

```
Trader → Seal-encrypt order → submit OrderCommitment<Base, Quote>
       → enclave decrypts, matches → MatchInstruction
       → PTB: consume MatchInstruction
              + cross collateral (settle_direct)
              + TransferPolicy.confirm_request(Base)   ← new
              + TransferPolicy.confirm_request(Quote)? ← if Quote also gated
              + SettlementReceipts
```

The settlement PTB grows by one or two `confirm_request` calls. The hot-potato invariant (`MatchInstruction` consumed atomically with the cross) is unchanged.

### What the enclave sees

Enclave matches plaintext orders as today. It does **not** verify eligibility — the on-chain `TransferPolicy` is the source of truth and will abort the settlement PTB if either counterparty fails the check. This is intentional: the enclave shouldn't hold KYC state; the issuer's Move policy already enforces it.

Consequence: enclave can match two parties who *both fail* eligibility, and the settlement will revert. That's wasted gas but no leak. Mitigation: enclave gets a cheap allowlist check before matching (read the issuer's allowlist registry from Sui RPC, cache 60s, skip matching orders from non-whitelisted addresses). Best-effort; on-chain policy remains the authority.

### What the trader sees

Identical UX to crypto pairs:

1. Pick pair from terminal dropdown (USDY/USDC, BENJI/USDC, etc.).
2. Size, limit, side, slippage — Seal-encrypted client-side.
3. Submit. Watch order land. Enclave matches. Receipt appears.

The only new pre-flight check: if trader isn't on the issuer's allowlist, terminal greys out the pair and links to issuer onboarding. Read allowlist via `useQuery` against the registry object — same pattern as the existing pool object reads.

## Settlement model

Shell settles each matched pair as a direct two-party cross inside a single PTB. RWA pairs work the same way as crypto pairs — `settle_direct<Base, Quote>` consumes both `OrderCommitment`s and crosses the collateral; the only RWA-specific addition is one or two `TransferPolicy.confirm_request` calls inserted in the same PTB. No external CLOB dependency.

For pairs that *do* have a liquid public venue (e.g. USDY/USDC), the roadmap covers an optional external-venue routing leg — but it's strictly additive and not required for v1.

Day-1 RWA target: **USDY/USDC** — most liquid tokenized treasury, Ondo has good Sui presence.

## Compliance-grade audit layer

Combine RWA settlement with the audit features from [`ai-execution-agent.md`](ai-execution-agent.md):

- **Per-fill receipt** — already on-chain via `SettlementReceipt`. Includes timestamp, counterparty, filled qty, price.
- **Walrus journal** — every order submission, every match proposal, every fill, every cancellation written as Walrus blob with previous-blob pointer. Immutable linked list, retrievable forever.
- **Enclave attestation per fill** — Nautilus signs each match; PCRs registered on-chain. Auditor can verify the matching code wasn't tampered with.
- **TCA report per parent intent** — for institutional block trades, agent generates Transaction Cost Analysis at completion: vwap, slippage, fill latency, venue breakdown. Written to Walrus, head pointer stored in trader's profile.

Result: regulator or compliance team asks "show me every USDY trade above $1M from Q1 with execution quality metrics" — Shell can produce it from on-chain + Walrus state alone, no centralised database.

## What this unlocks for the pitch

Shell isn't just *another* private DEX. With RWA support it becomes:

- **The confidential execution layer for tokenized treasuries on Sui.** First-mover positioning for a market that's exploding (BlackRock BUIDL, Franklin BENJI, Ondo USDY all crossed $1B+ TVL in 2025).
- **Compliance-native by construction.** Privacy + auditability historically conflict; Shell ships both because Nautilus attestation + Walrus permanence make them compatible.
- **A real story for the DeFi & Payments track** — institutional adoption needs both private execution and provable settlement. Crypto-native pairs prove the tech; RWA pairs prove the product-market fit.

## Build order (incremental, no protocol changes)

Day 1:
- Test `TransferPolicy.confirm_request` insertion in `settle_direct` PTB end-to-end.
- Wallet allowlist precheck in terminal: query issuer registry, gate the pair selector.

Day 2:
- Settings page: surface trader's allowlist status per issuer.
- Terminal pair dropdown: add USDY/USDC, BENJI/USDC entries with eligibility chips.
- Wire receipt explorer link to show the `TransferPolicy` confirmation step.

Day 3 (stretch):
- TCA report generation for RWA block trades (combines with [`ai-execution-agent.md`](ai-execution-agent.md) Feature 2).
- Issuer onboarding deep-link from terminal when wallet isn't allowlisted.

## Risks

- **Allowlist staleness** — issuer registries change. Cache aggressively but invalidate on `AllowlistUpdated` events. Settlement PTB is the safety net regardless.
- **Cross-jurisdiction matching** — enclave could match a US-eligible buyer with a non-US-eligible seller; settlement reverts. Pre-match jurisdiction filter in the matcher is straightforward but requires issuer cooperation (publishable per-address jurisdiction tags).
- **Privacy vs. reporting obligations** — some regulators require trade reporting in near-real-time. Shell's privacy is pre-trade only; post-settlement the receipts are public on Sui. Confirm this satisfies the reporting regimes targeted (US Reg ATS, EU MiCA reporting). Likely yes; flag if not.

## Open questions

1. Which RWA issuer engages first? Ondo (USDY) is the obvious anchor — biggest TVL, most institutional flow, already on Sui.
2. Does Shell list a single anchor pair on day 1 or several? Single pair (USDY/USDC) recommended — proves the integration, focuses demo.
3. Do we need an explicit issuer partnership for the demo or can we use mainnet USDY without one? Reading from a public allowlist registry is permissionless; deeper integration (issuer-side allowlist additions, joint marketing) needs a conversation.
4. Pricing for institutional flow — does Shell charge a maker/taker fee, or a per-block flat? Out of scope for this doc but worth deciding before pitch.

---

## Demo Day implementation plan (June 13-14)

### Goal
Show a live TBILL/USDC dark pool trade alongside SUI/USDC. Real RWA coin types (USDY, BENJI, BUIDL) pre-wired in config but disabled — flip `enabled: true` on mainnet.

### Step 1 — Deploy mock TBILL token on testnet

New standalone Move package `rwa-mock/`:

```
rwa-mock/
  Move.toml
  sources/tbill.move   — one-time-witness coin, 6 decimals, symbol "TBILL", name "Mock T-Bill"
```

Mint ~10,000 TBILL to both test wallets. Fixed NAV price: $1.00 USDC. No DeepBook pool needed.

### Step 2 — Multi-pair config in `web/src/lib/sui.ts`

```ts
export interface TradingPair {
  enabled: boolean;           // false = hidden from UI, pre-wired for mainnet
  label?: string;
  baseSymbol: string;
  baseCoinType: string;
  baseDecimals: number;
  quoteSymbol: string;
  quoteCoinType: string;
  quoteDecimals: number;
  deepbookPoolKey: string | null;
  priceSource: 'deepbook' | 'fixed';
  fixedPrice?: number;
}

export const TRADING_PAIRS: TradingPair[] = [
  { enabled: true,
    baseSymbol: 'SUI', baseCoinType: '0x2::sui::SUI', baseDecimals: 9,
    quoteSymbol: 'USDC', quoteCoinType: QUOTE_COIN_TYPE, quoteDecimals: 6,
    deepbookPoolKey: DEEPBOOK_POOL_KEY, priceSource: 'deepbook' },

  { enabled: true,                              // testnet demo — disable on mainnet
    label: 'T-Bill (Mock)', baseSymbol: 'TBILL',
    baseCoinType: '{TBILL_PACKAGE_ID}::tbill::TBILL', baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: QUOTE_COIN_TYPE, quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00 },

  { enabled: false,                             // flip true on Sui mainnet
    label: 'USDY (Ondo Finance)', baseSymbol: 'USDY',
    baseCoinType: '0x...::usdy::USDY', baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: '0xdba3...::usdc::USDC', quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00 },

  { enabled: false,
    label: 'BENJI (Franklin Templeton)', baseSymbol: 'BENJI',
    baseCoinType: '0x...::benji::BENJI', baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: '0xdba3...::usdc::USDC', quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00 },

  { enabled: false,
    label: 'BUIDL (BlackRock)', baseSymbol: 'BUIDL',
    baseCoinType: '0x...::buidl::BUIDL', baseDecimals: 6,
    quoteSymbol: 'USDC', quoteCoinType: '0xdba3...::usdc::USDC', quoteDecimals: 6,
    deepbookPoolKey: null, priceSource: 'fixed', fixedPrice: 1.00 },
];

export const ACTIVE_PAIRS = TRADING_PAIRS.filter(p => p.enabled);
export const DEFAULT_PAIR = ACTIVE_PAIRS[0];
```

Keep `BASE_COIN_TYPE`, `collateralTypeFor()` as default-pair-based exports for backwards-compat.
Extend `collateralTypeFor(side, pair?)` to accept optional pair arg.

### Step 3 — Pair selector in `IOIForm.tsx` + `SealedOrderForm.tsx`

Both forms:
- Add `const [pair, setPair] = useState(DEFAULT_PAIR)`
- Segmented button at top of form: one button per `ACTIVE_PAIRS` entry
- `asset` field in IOI plaintext: `pair.baseCoinType`
- Size labels: `pair.baseSymbol`
- Price ref: if `pair.priceSource === 'fixed'` → return `{ bid, ask, mid: pair.fixedPrice }`, skip DeepBook
- Reference price button label: "Use ref price ±2%"
- Collateral logic: `pair.baseCoinType` / `pair.quoteCoinType` instead of `SUI_TYPE` / `QUOTE_COIN_TYPE`

### Step 4 — Agent coin type config

`shell-agent/src/config.ts`: add `baseCoinType` (default `'0x2::sui::SUI'`, env `AGENT_BASE_COIN_TYPE`).

`shell-agent/src/orders.ts`: replace two hardcoded coin type strings with `config.baseCoinType` / `config.quoteCoinType`.

### Mainnet path

To activate a real RWA on mainnet:
1. Find the coin type address on Sui mainnet explorer
2. Set `enabled: true` in the matching `TRADING_PAIRS` entry
3. Replace the `0x...` placeholder with the real address
4. Deploy — no other code changes needed

For oracle-priced RWAs (not fixed NAV), add `priceSource: 'pyth'` + `pythPriceId` to the interface and a Pyth fetch case in `fetchMidPrice`.

### Verification

- `/agent`: TBILL/USDC selector → post IOI → Active IOIs shows TBILL row with ENCRYPTED badge
- `/terminal`: TBILL/USDC → submit order → `OrderCommitment<TBILL_COIN_TYPE>` on-chain (verify on Suiscan)
- Two wallets post opposite TBILL IOIs → enclave matches → both accept → SettlementReceipts show TBILL amounts
- SUI/USDC pair unaffected
- Disabled pairs (USDY, BENJI, BUIDL) not visible in UI
- `npx tsc --noEmit` clean in `web/` and `shell-agent/`

---

## References

- Ondo USDY on Sui — https://ondo.finance/usdy
- Franklin Templeton BENJI — https://www.franklintempleton.com/investments/options/money-market-funds/products/29386/SINGLCLASS/franklin-on-chain-u-s-government-money-fund/FOBXX
- Libre Capital — https://libre.cap/
- Mountain Protocol USDM — https://mountainprotocol.com/
- Sui RWA overview — https://blog.sui.io/sui-real-world-assets/
- Sui `TransferPolicy` — https://docs.sui.io/standards/kiosk#transfer-policy
