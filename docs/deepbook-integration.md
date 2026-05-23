# DeepBook v3 settlement — design [SUPERSEDED]

> **Status: superseded — DeepBook is no longer in Shell's settlement path.**
>
> Shell now settles each matched pair as a direct two-party collateral swap inside
> a single PTB via `shell::settlement::settle_direct`. The original DeepBook
> integration was attempted (see [settle-fix-plan.md](settle-fix-plan.md)) but
> blocked on DeepBook's `Pool.allowed_versions = {1..5}` not containing
> `current_version() = 8` from the deployed deepbook v19 package — and Sui's
> publisher pins downstream packages to the LATEST deepbook published-at, so
> shell cannot statically link an older deepbook version. The doc below is
> kept for historical reference of the design that *would have* worked if the
> on-chain `allowed_versions` set were maintained.

---

Closing the credibility gap in the pitch: `shell::settlement::settle` currently does a direct collateral swap between maker and taker. The pitch says "settlement against DeepBook's depth." This doc scopes the smallest honest change to make the second claim true on testnet, on the existing matched-pair flow, without touching the privacy invariants.

Track relevance: DeFi & Payments — Trust-Minimized Finance ("conditional execution, automated enforcement"). The hot-potato `MatchInstruction` already enforces atomic settle-or-revert; what's missing is that the settlement leg actually hits the public CLOB.

## What's there today

- `move/sources/settlement.move::settle<TMaker, TTaker>` unpacks the `MatchInstruction`, asserts the two `OrderCommitment` ids match, consumes them, and `transfer::public_transfer`s each trader's escrowed collateral to the *other* trader. No DeepBook anywhere.
- `web/src/lib/sui.ts` already references `deepbookPoolKey: SUI_DBUSDC` and a `deepbook-indexer.testnet.mystenlabs.com` URL. The client side has been written *as if* DeepBook were the venue; only the Move side is missing.
- `@mysten/deepbook-v3` is in `web/node_modules/` (constants + transactions surface). Vendored testnet IDs verified against `src/utils/constants.ts`.

## DeepBook v3 on testnet — verified IDs

| Thing | ID / type |
| --- | --- |
| DeepBook package | `0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c` |
| Registry | `0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1` |
| DEEP treasury | `0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb` |
| DEEP coin type | `0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP` |
| **SUI/DBUSDC pool** | `0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5` |
| DBUSDC coin type | `0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC` |
| Helper DEEP/SUI pool (faucet route to DEEP) | `0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f` |

Source: `@mysten/deepbook-v3` SDK constants (vendored at `web/node_modules/@mysten/deepbook-v3/src/utils/constants.ts`).

## DeepBook v3 API surface — what's relevant

Two settlement-shaped paths exist. Both signatures verified against `MystenLabs/deepbookv3/packages/deepbook/sources/pool.move` + `balance_manager.move` (`main` branch).

### Path A — BalanceManager + `place_limit_order` (the "real" CLOB path)

```move
// balance_manager.move
public fun new(ctx: &mut TxContext): BalanceManager
public fun mint_trade_cap(bm: &mut BalanceManager, ctx: &mut TxContext): TradeCap
public fun generate_proof_as_trader(bm: &mut BalanceManager, cap: &TradeCap, ctx: &TxContext): TradeProof
public fun deposit<T>(bm: &mut BalanceManager, coin: Coin<T>, ctx: &mut TxContext)
public fun withdraw<T>(bm: &mut BalanceManager, amount: u64, ctx: &mut TxContext): Coin<T>

// pool.move
public fun place_limit_order<B, Q>(
    self: &mut Pool<B, Q>,
    bm: &mut BalanceManager,
    proof: &TradeProof,
    client_order_id: u64,
    order_type: u8,             // 0 NO_RESTRICTION | 1 IOC | 2 FOK | 3 POST_ONLY
    self_matching_option: u8,   // 0 ALLOWED | 1 CANCEL_TAKER | 2 CANCEL_MAKER
    price: u64,
    quantity: u64,
    is_bid: bool,
    pay_with_deep: bool,        // forced true in current version
    expire_timestamp: u64,
    clock: &Clock,
    ctx: &TxContext,
): OrderInfo
```

Pros: native CLOB semantics. Maker order can rest. Two parties' orders cross atomically in one PTB because they're on different BMs (no self-match).

Cons: each trader needs a BM provisioned, funded with the trade asset, funded with DEEP, plus a `TradeCap` delegated to Shell so the enclave can `generate_proof_as_trader`. That's two new objects per trader and ongoing lifecycle management.

### Path B — `swap_exact_base_for_quote` / `swap_exact_quote_for_base` (the swap path)

```move
public fun swap_exact_base_for_quote<B, Q>(
    self: &mut Pool<B, Q>,
    base_in: Coin<B>,
    deep_in: Coin<DEEP>,
    min_quote_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<B>, Coin<Q>, Coin<DEEP>)

public fun swap_exact_quote_for_base<B, Q>(
    self: &mut Pool<B, Q>,
    quote_in: Coin<Q>,
    deep_in: Coin<DEEP>,
    min_base_out: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (Coin<B>, Coin<Q>, Coin<DEEP>)
```

Pros: takes **raw coins**, no BM, no `TradeCap`, no `TradeProof`. Returns leftover input + the swapped output + leftover DEEP. The fill-quality contract is the `min_*_out` floor.

Cons: doesn't expose limit-order semantics — every fill is taker-side against existing depth. If the SUI/DBUSDC book is thin in the matched direction, the swap reverts.

### Recommendation: ship Path B first, keep Path A on the roadmap

For the hackathon scope, **Path B is the right answer**. Reasons:

1. **Move-side diff is small** (~120 lines for the new `settle_deepbook` entry). Path A would mean redesigning the `OrderCommitment` to carry a `TradeCap` and forcing traders through BM creation in the SDK.
2. **Pricing story is honest**. The enclave matched at `filled_price`; the swap passes `min_*_out` derived from `filled_price ± max_slippage_bps`. Either both swaps fill at-or-better than the matched price, or both revert atomically. That's the "fait accompli" the pitch promises.
3. **DEEP fee logistics are bounded**. Shell pre-funds the enclave wallet with a DEEP buffer (≤1 DEEP covers many settlements). Each swap consumes a few DEEP, leftover is refunded back to the same wallet.
4. **No trader-side friction**. The SDK and frontend don't change. Existing `OrderCommitment` shape works.

Path A becomes interesting once Shell wants resting orders inside DeepBook (acting as a maker beyond the sealed pool) — a v2 concern.

## Move-side change

Add to `move/sources/settlement.move`:

```move
use deepbook::pool::Pool;
use deepbook::pool;
use token::deep::DEEP;
use sui::clock::Clock;

const ESlippageFloor: u64 = 2;

/// Settle a matched pair *through DeepBook v3*. Both legs swap into the
/// pool at the enclave-matched price as their slippage floor. The PTB
/// reverts atomically if either side can't fill.
///
/// TBase / TQuote are the DeepBook pool's base/quote. The matcher decides
/// which side of the pair is base and which is quote at order-submission
/// time; the maker's collateral is base, the taker's is quote.
public fun settle_deepbook<TBase, TQuote>(
    instruction: MatchInstruction,
    maker_order: OrderCommitment<TBase>,
    taker_order: OrderCommitment<TQuote>,
    pool: &mut Pool<TBase, TQuote>,
    deep_in: Coin<DEEP>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    // 1. Verify the instruction matches both commitments (same as `settle`).
    // 2. Consume the OrderCommitments → get maker_base: Coin<TBase>, taker_quote: Coin<TQuote>.
    // 3. Split deep_in roughly in half for the two swaps.
    // 4. Maker leg: swap_exact_base_for_quote(pool, maker_base, deep_a, min_quote, clock, ctx)
    //    where min_quote = filled_size * filled_price * (10_000 - max_slippage_bps) / 10_000
    // 5. Taker leg: swap_exact_quote_for_base(pool, taker_quote, deep_b + leftover, min_base, clock, ctx)
    //    where min_base = filled_size * (10_000 - max_slippage_bps) / 10_000
    // 6. transfer maker_quote → maker, taker_base → taker.
    // 7. Return leftover base + leftover quote + leftover DEEP to enclave wallet (or fold into receipt).
    // 8. Mint two SettlementReceipts with the DeepBook tx digest the enclave passed in.

    // ... ~80 lines of glue ...
}
```

Notes:

- The existing `settle` stays as `settle_direct` (rename) for fallback testing.
- `max_slippage_bps` lives in the decrypted plaintext today; the enclave inlines it into the `MatchPayload`'s slippage floor so the Move side doesn't need to re-derive it.
- `min_quote` math uses u128 intermediates to avoid overflow at large sizes.
- DEEP overdrafts: if `deep_in` is undersized, the first swap aborts; the PTB reverts; no state change. Safe.

### `Move.toml` change

```toml
[dependencies]
deepbook = { git = "https://github.com/MystenLabs/deepbookv3.git", subdir = "packages/deepbook", rev = "main" }
```

`Sui` and `MoveStdlib` deps are inherited transitively.

## Enclave-side change

`enclave-nitro/apps/shell/mod.rs::submit_settlement` already builds the settlement `Transaction`. The diff is:

1. Add three new tool/inputs to the PTB:
   - `Pool<TBase, TQuote>` (shared object, `Input::Shared { object_id: SUI_DBUSDC_POOL, initial_shared_version, mutable: true }`)
   - `Coin<DEEP>` (owned, `Input::ImmutableOrOwned { object_id, version, digest }` — fetched fresh per settle from the enclave wallet's coins)
   - `Clock` (shared, `0x6`)
2. Swap the `MoveCall` target from `shell::settlement::settle` to `shell::settlement::settle_deepbook`.
3. Pass `TBase = SUI`, `TQuote = DBUSDC` as type args (or vary based on the order's collateral type — both directions are supported via the type generics).

Estimated diff: ~60 lines.

## Pre-deploy logistics

One-time setup on testnet:

```bash
# Convert ~1 SUI to DEEP via the testnet helper pool (or use the Walrus get-wal-style helper if it exists for DEEP)
sui client switch --address $ENCLAVE_ADDR
# DeepBook v3's testnet faucet is the DEEP_SUI pool — buy DEEP with SUI
# via @mysten/deepbook-v3 SDK or a one-shot PTB calling swap_exact_quote_for_base
# on pool 0x48c9... with min_base = small.

# Then fund the enclave with DBUSDC + SUI for the actual demo flow (already funded
# per ts-sdk/deployments/testnet.json hints).
```

Costs are testnet-only: dust.

## Slippage policy

Pick one and pin it:

- **Strict**: `max_slippage_bps = 0` → every settlement must execute at exactly the matched price. Cleanest pitch ("the price the parties agreed to is the price they get") but reverts often.
- **Tight (50 bps default)**: matches the placeholder in our SDK (`max_slippage_bps: 50`). Reverts only when the book moves >0.5% between match and execution. Good demo balance.
- **Loose (200–500 bps)**: rare reverts; weakens the price-discipline pitch.

Recommend **50 bps** since the SDK already defaults to it.

## What's still not closed

- **One side from the public book.** If only one trader's order is sealed and there's no sealed counterparty, the enclave should be able to consume the order via a single swap. The current matcher only matches sealed pairs; v1.1 work.
- **DeepBook fees in the matched price.** Right now `filled_price` is the inter-party clearing price; DeepBook charges a taker fee on top in DEEP. If the swap fills at the matched price, the actual proceeds are slightly less because of fees. The receipt should record both numbers — easy doc-level fix.
- **DBUSDC vs USDC asymmetry on testnet.** Testnet uses DBUSDC; mainnet uses USDC. The Move generics handle this, but the SDK + frontend type tags need to be wired per network (already done in `web/src/lib/sui.ts`).
- **Front-running of the settle PTB.** Within one PTB the swap is atomic; nothing leaks pre-execution. But the broadcast of the signed PTB itself is observable in mempool. The order content is still sealed at that point (only the swap amounts + pool are public on the PTB inputs) — so a frontrunner sees "Shell is about to swap N base into pool P at min_price X" and could trade ahead. Mitigation is private mempool / sponsored sequencing, out of hackathon scope.

## Scope estimate

| Step | Estimate |
| --- | --- |
| Move.toml dep + settle_deepbook + unit test | 4–6 h |
| Enclave-side PTB rebuild + Pool/DEEP input wiring | 2–3 h |
| Get DEEP on the enclave wallet via DEEP_SUI pool | 30 m |
| End-to-end testnet smoke (one demo trade) | 1–2 h |
| Update spec + status table + threat-model paragraph | 1 h |

**~1.5 working days.** Reasonable for the credibility-gap fix called out in the hackathon review.

## References

- DeepBook v3 repo — https://github.com/MystenLabs/deepbookv3
- `pool.move` (place / swap) — https://github.com/MystenLabs/deepbookv3/blob/main/packages/deepbook/sources/pool.move
- `balance_manager.move` — https://github.com/MystenLabs/deepbookv3/blob/main/packages/deepbook/sources/balance_manager.move
- `constants.move` (order types, self-matching) — https://github.com/MystenLabs/deepbookv3/blob/main/packages/deepbook/sources/helper/constants.move
- DeepBook v3 SDK constants (vendored at `web/node_modules/@mysten/deepbook-v3/src/utils/constants.ts`)
- Sui docs — https://docs.sui.io/standards/deepbook
