# Settlement Fix — Action Plan

## Symptom

Two wallets post matching IOIs, enclave emits `MatchProposed`, both wallets
click **Accept** and `pool::submit_order` succeeds (collateral escrowed).
But no `SettlementReceipt` ever mints. The two `OrderCommitment` shared
objects stay alive until `expiry_epoch`.

## Root cause

`shell::settlement::settle` runs the matched trade through DeepBook v3
as two swaps:

1. **Leg 1** — maker sells `filled_size` base → expects ≥
   `expected_quote × (1 − slippage_bps/10000)`
2. **Leg 2** — taker buys `filled_size` base back with quote → expects ≥
   `filled_size × (1 − slippage_bps/10000)`

`expected_quote = filled_size × filled_price / 1e9`.

The enclave passes a **hardcoded** `DEFAULT_SLIPPAGE_BPS = 50` (0.5 %)
into the settle PTB
(`enclave-nitro/apps/shell/mod.rs:100` and `:1111`). The
per-order `max_slippage_bps` decrypted from the sealed envelope is
**not used** today — comment at lines 97–98 flags this as future work.

At the current testnet DeepBook book the spread is ~1 ¢ wide on a
~$1.00 mid:

```
asks: [1.004, 1.009]
bids: [0.995, 0.994]
```

For both legs to clear at 0.5 % slippage the enclave-matched price must
satisfy:

```
agreed_price ∈ [best_bid × 1.005, best_ask × 0.995]
             = [1.000, 0.999]   ← empty interval
```

No single price exists, so settle reverts every time. With agreed_price
= 0.9995 our last attempt got 0.9940 from leg 1 vs a 0.9959 min →
revert.

## Secondary problem

Stuck `OrderCommitment` objects from earlier failed attempts can only
be unwound by `pool::cancel_expired`, which asserts
`ctx.epoch() ≥ order.expiry_epoch`. We are at epoch 1107, those orders
expire at 1112 — ~5 days of locked collateral.

Worse: until those stuck orders expire the enclave matcher keeps
re-pairing them with any newly submitted order whose size happens to
equal the stuck size. The match still tries to settle at the stuck
$2.00 limit and reverts again.

## Fix — two independent changes

### 1. Enclave: widen settle slippage

**File**: `enclave-nitro/apps/shell/mod.rs`

```rust
// line 100
const DEFAULT_SLIPPAGE_BPS: u64 = 200; // 2 % — was 50
```

200 bps (2 %) is large enough to absorb the current spread plus a few
ticks of drift between match and settle. 300 bps if you want a wider
safety margin during demos.

(Optional but cheap follow-up: thread the per-order
`max_slippage_bps` decrypted at line 719 into the settle PTB at line
1111 instead of using the constant. That gives traders control while
keeping a sane default.)

**Deploy steps**:

```bash
cd enclave-nitro
make ENCLAVE_APP=shell           # rebuild EIF → new PCRs
# capture PCR0 / PCR1 / PCR2 from build output
```

Then from the wallet that owns the on-chain `Enclave<SHELL>`
attestation config:

```bash
sui client call \
  --package <SHELL_PACKAGE_ID_LATEST> \
  --module attestation \
  --function update_pcrs \
  --args <enclaveConfigId> <PCR0> <PCR1> <PCR2> \
  --gas-budget 50000000
```

Relaunch the enclave in **prod-mode** on the host:

```bash
nitro-cli terminate-enclave --all
make ENCLAVE_APP=shell run-enclave
```

Verify with `curl https://sui.furqaannabi.com/` → expect `Pong!`.

### 2. Move: trader-initiated cancel

**File**: `move/sources/pool.move`

Add right after `cancel_expired`:

```move
/// Trader-initiated cancel that works at any time. Refunds the
/// escrowed collateral. The enclave matcher will try to settle the
/// commitment until this is called or the expiry passes.
public fun cancel_anytime<T>(order: OrderCommitment<T>, ctx: &mut TxContext): Coin<T> {
    assert!(order.trader == ctx.sender(), EWrongTrader);
    let OrderCommitment {
        id,
        trader: _,
        sealed_envelope: _,
        commit_hash: _,
        collateral,
        expiry_epoch: _,
    } = order;
    id.delete();
    coin::from_balance(collateral, ctx)
}
```

**Suggested tests** (`move/tests/pool_tests.move`):

```move
#[test]
fun cancel_anytime_refunds_before_expiry() {
    let mut s = ts::begin(ADMIN);
    shell::shell::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(555, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 999, s.ctx());

    s.next_tx(TRADER);
    let order = s.take_shared<OrderCommitment<SUI>>();
    let refund = pool::cancel_anytime<SUI>(order, s.ctx());
    assert!(refund.value() == 555);
    refund.burn_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = pool::EWrongTrader)]
fun cancel_anytime_by_non_trader_aborts() {
    let mut s = ts::begin(ADMIN);
    shell::shell::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(100, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 999, s.ctx());

    s.next_tx(OTHER);
    let order = s.take_shared<OrderCommitment<SUI>>();
    let refund = pool::cancel_anytime<SUI>(order, s.ctx());
    refund.burn_for_testing();
    abort 0
}
```

`sui move test` should report 9/9 pass.

**Publish steps** (run from the wallet that holds the UpgradeCap):

UpgradeCap object: `0x482f0eb651c900224d73f8bfae67662432d243bafd7f98ef8f0133e72743ff72`
UpgradeCap owner:  `0x8181e2f0ac453244328ba1862930ab884544f788fc2be30ebcbb3123b43e1740`

```bash
cd move
sui client switch --address 0x8181e2f0ac453244328ba1862930ab884544f788fc2be30ebcbb3123b43e1740
sui client upgrade \
  --upgrade-capability 0x482f0eb651c900224d73f8bfae67662432d243bafd7f98ef8f0133e72743ff72 \
  --gas-budget 200000000
```

Note the new `published-at` package id from the output (call it
`PKG_LATEST_V3`).

The enclave does **not** need to be rebuilt for this Move upgrade —
the enclave only calls `pool::submit_order`, `pool::settle`,
`ioi::propose_match` and `pool::OrderSubmitted` events. None of those
change. Only the new `cancel_anytime` is added.

### 3. Update package-id constants

After step 2 publishes, update these four files with `PKG_LATEST_V3`:

| File | Field |
|---|---|
| `ts-sdk/deployments/testnet.json` | `latestPackageId` |
| `web/src/lib/sui.ts` | `TESTNET.shellPackageIdLatest` |
| `shell-agent/src/config.ts` | `shellPackageIdLatest` default literal |
| `enclave-nitro/apps/shell/mod.rs` | `SHELL_PACKAGE_ID_LATEST` const |

Both event filters and `moveCall` targets that already reference
`shellPackageIdLatest` (IOI events, `record_ioi`, `propose_match`) keep
working — they auto-resolve to the latest at the new id. The original
package id used for Seal identity and the legacy `pool::*` event
filters stays the same.

### 4. Clean slate

After (1) and (2) ship and the constants are updated:

1. Each wallet that still has a stuck `OrderCommitment` calls
   `pool::cancel_anytime` to refund collateral. Stuck objects we know
   of:

   | Trader | Order id | Collateral |
   |---|---|---|
   | 0x3d743f6…32a5ae82 (buy) | 0x10f65d0a3a3835b8ba0a2e4e02ea937e328e085bd9a9c1381b3905b94967e096 | 4 DUSDC |
   | 0x3d743f6…32a5ae82 (buy) | 0x3dbbd6e7431fb85a… (second accept) | ~3.71 DUSDC |
   | 0x4036b66…0643e84e (sell) | 0x274163f338b41c3e34169e3a31b773875a7a351db9c96401c29bfc5a4ec8c468 | 2 SUI |
   | 0x4036b66…0643e84e (sell) | 0x2d385fd309146576… (second accept) | 2 SUI |
   | 0x176b5e3…1fb55be8 (buy) | 0x0ed10a0e6441de8e9fb5e6b484e45af257ab6964360ad5e4116c0edea3b4c816 | 3.498 DUSDC |
   | 0x9b9abe4…e8f2cdef (sell) | 0x747f91ce0c05d31baab05877c575e7f793130543b02208b3053d60bdfda91a55 | 3.5 SUI |

   Cancel via:

   ```bash
   sui client call \
     --package <PKG_LATEST_V3> \
     --module pool \
     --function cancel_anytime \
     --type-args <coin_type> \
     --args <order_id> \
     --gas-budget 20000000
   ```

   `<coin_type>` is `0x2::sui::SUI` for sell orders or
   `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`
   for buy orders.

   Or wait for epoch 1112 (~5 days) and the existing
   `cancel_expired` works.

2. Post fresh IOIs at any size. With the matcher no longer fighting
   stuck $2 orders and the wider 2 % slippage absorbing DeepBook
   spread, settle should succeed and `SettlementReceipt` should mint.

   Suggested test trade:
   - Both wallets: **Size min 1**, **Size max 3** → agreed_size ≈ 2 SUI.
   - Click **Use market range** to fill price (≈ 0.99 / 1.01).
   - Submit IOI from each wallet, watch the proposal land in IOI Desk,
     click Accept on both sides.
   - Within ~15 s a `SettlementReceipt` should appear; the
     `ProposalFeed` row flips to **SETTLED ↗**.

## Verification checklist

- [ ] `sui move test` reports 9/9 pass after Move change
- [ ] EIF rebuild prints new PCR set
- [ ] `update_pcrs` tx lands on chain; `enclaveConfigId` shows new PCRs
- [ ] Enclave `/` endpoint replies `Pong!` after relaunch
- [ ] Web `npx tsc --noEmit` passes after package-id constants update
- [ ] Six stuck `OrderCommitment` objects refunded via `cancel_anytime`
- [ ] Fresh test trade mints `SettlementReceipt` on both sides

---

## Resolution — 2026-05-23

The slippage-widening fix alone was insufficient. Working through it
surfaced **three** additional latent bugs in the settle path:

1. **Type mismatch** — the trader-side stablecoin was DUSDC (`0xe95040…`)
   but DeepBook's testnet SUI/DBUSDC pool quotes in DBUSDC (`0xf7152c…`).
   Fix: switched the web frontend, shell-agent, and SDK to use DBUSDC
   as the trader-side quote coin.

2. **Maker/taker direction** — the enclave matcher pinned `maker = whoever
   arrived first`. `shell::settlement::settle` required `maker = sell side`
   (so its TBase/TQuote line up with `Pool<TBase, TQuote>`). Fix: matcher
   always assigns `maker = ask, taker = bid` in
   [enclave-nitro/apps/shell/mod.rs](../enclave-nitro/apps/shell/mod.rs)
   (`match_orders`).

3. **DeepBook package-version disabled** — the SUI/DBUSDC pool's stored
   `allowed_versions = {1, 2, 3, 4, 5}` (verified on chain via
   `0x6f656f16…`). The latest deepbook published-at (v19 at `0x74cd5657…`)
   has `current_version() = 8`. Sui's publisher pins every downstream
   package's link table to the **latest** published-at of each dep, so
   shell — no matter which deepbook git rev we pin in `Move.toml`, no
   matter how we use `addr_subst` overrides — always routes calls through
   the disabled v19. `pool::load_inner` aborts with
   `EPackageVersionDisabled` (code 11). The fix would require DeepBook ops
   to add `8` to the pool's `allowed_versions` set.

Given (3) is outside Shell's control and the testnet deepbook is unmaintained
for our pool, we removed DeepBook from the settlement path entirely. The
public function `shell::settlement::settle` is kept as a deprecated stub
(Sui's `Compatible` upgrade policy forbids removing public functions); the
real settle is now `settle_direct<TBase, TQuote>` which:

- consumes the hot-potato `MatchInstruction`
- consumes both `OrderCommitment`s
- transfers maker's base → taker, taker's quote → maker (direct cross)
- mints two `SettlementReceipt`s

End-to-end testnet proof (2026-05-23, shell v6 at `0x954e9062…`):

- Sell IOI (deployer 0x8181e2f0…) + buy IOI (counterparty 0x84106a23…) posted
- Enclave matched, MatchProposed at tx `9ASnmV8r…`
- Both sides accepted under `OrderCommitment<DBUSDC>` + `OrderCommitment<SUI>`
- Enclave settle tx [`JAm9MKr6skPhtutq5upT5wzGqcg8S2osEucvuoJ5doqy`](https://suiscan.xyz/testnet/tx/JAm9MKr6skPhtutq5upT5wzGqcg8S2osEucvuoJ5doqy):
  attestation::verify + settle_direct<SUI, DBUSDC>, status: success
- Deployer received 0.168750 DBUSDC, counterparty received 0.150000 SUI
- Two `SettlementReceipt` objects minted

The pitch loses "settled via DeepBook depth"; what it keeps is "MEV- and
front-running-resistant institutional execution with cryptographically-bound
atomic settlement." External-venue routing is roadmap (post-hackathon)
once DeepBook (or any other public on-chain venue) is back to a state
where downstream Move packages can statically link against it.
