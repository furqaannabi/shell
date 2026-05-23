module shell::settlement;

use shell::attestation::{Self, MatchInstruction};
use shell::pool::{Self, OrderCommitment};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use deepbook::pool::{Self as deepbook_pool, Pool as DeepBookPool};
use token::deep::DEEP;

const EOrderMismatch: u64 = 0;
const ETraderMismatch: u64 = 1;
const EBadSlippage: u64 = 2;
const EDeprecated: u64 = 3;

const BPS_DENOM: u64 = 10_000;
const FLOAT_SCALING: u128 = 1_000_000_000;

/// DEPRECATED — this signature is retained for Sui upgrade-compatibility
/// (`compatible` policy forbids removing/changing public functions).
/// The body is gone because the deepbook static linkage is unsettleable
/// on testnet: shell's link table forcibly resolves deepbook → latest
/// published-at (v19, `current_version()=8`), which is NOT in the
/// SUI_DBUSDC pool's `allowed_versions={1..5}`. Sui's publisher rewrites
/// `Move.toml addr_subst` overrides, so we can't statically link an
/// older deepbook version. Aborts unconditionally; callers should use
/// `settle_direct` instead.
public fun settle<TBase, TQuote>(
    _instruction: MatchInstruction,
    _maker_order: OrderCommitment<TBase>,
    _taker_order: OrderCommitment<TQuote>,
    _pool: &mut DeepBookPool<TBase, TQuote>,
    _deep_in: Coin<DEEP>,
    _slippage_bps: u64,
    _clock: &Clock,
    _ctx: &mut TxContext,
) {
    let _ = BPS_DENOM;
    let _ = FLOAT_SCALING;
    let _ = EBadSlippage;
    abort EDeprecated
}

/// Settle a matched pair as a direct two-party collateral swap.
///
/// The enclave-signed `MatchInstruction` (a hot-potato) guarantees the
/// fill came out of the off-chain matcher; this function consumes the
/// two `OrderCommitment`s and crosses the legs — maker (sell, base) →
/// taker, taker (buy, quote) → maker — then mints a `SettlementReceipt`
/// for each party. Atomic settle-or-revert because the hot-potato must
/// be consumed in the same PTB.
public fun settle_direct<TBase, TQuote>(
    instruction: MatchInstruction,
    maker_order: OrderCommitment<TBase>,
    taker_order: OrderCommitment<TQuote>,
    ctx: &mut TxContext,
) {
    let maker_order_id = object::id(&maker_order);
    let taker_order_id = object::id(&taker_order);

    let (
        maker,
        taker,
        instr_maker_id,
        instr_taker_id,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
    ) = attestation::unpack(instruction);

    assert!(maker_order_id == instr_maker_id, EOrderMismatch);
    assert!(taker_order_id == instr_taker_id, EOrderMismatch);

    let (maker_trader, _, maker_base_balance) = pool::consume(maker_order);
    let (taker_trader, _, taker_quote_balance) = pool::consume(taker_order);
    assert!(maker_trader == maker, ETraderMismatch);
    assert!(taker_trader == taker, ETraderMismatch);

    let maker_base = coin::from_balance(maker_base_balance, ctx);
    let taker_quote = coin::from_balance(taker_quote_balance, ctx);

    transfer::public_transfer(taker_quote, maker);
    transfer::public_transfer(maker_base, taker);

    let maker_receipt = pool::new_receipt(
        maker,
        taker,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
        ctx,
    );
    let taker_receipt = pool::new_receipt(
        taker,
        maker,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
        ctx,
    );
    transfer::public_transfer(maker_receipt, maker);
    transfer::public_transfer(taker_receipt, taker);
}
