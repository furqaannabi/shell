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

const BPS_DENOM: u64 = 10_000;
/// DeepBook prices are scaled by 1e9 (FLOAT_SCALING in their constants
/// module). `filled_price` coming out of the enclave is in the same units.
const FLOAT_SCALING: u128 = 1_000_000_000;

/// Settle a matched pair through DeepBook v3. Both legs swap through
/// the public CLOB at the enclave-matched price (used as the slippage
/// floor). Either both fills succeed at-or-better than that price, or
/// the PTB reverts atomically. The maker's collateral is the base
/// asset, the taker's is the quote asset — the enclave aligns sides at
/// match time.
///
/// `slippage_bps` is the trader's max_slippage carried from the
/// decrypted plaintext (the enclave passes it; it never lands on chain
/// pre-match). `deep_in` covers DeepBook's per-swap DEEP fee; leftover
/// DEEP plus any unfilled base/quote dust is folded back into the
/// traders' transfers (with DEEP dust refunded to `ctx.sender()` —
/// i.e. the enclave wallet).
public fun settle<TBase, TQuote>(
    instruction: MatchInstruction,
    maker_order: OrderCommitment<TBase>,
    taker_order: OrderCommitment<TQuote>,
    pool: &mut DeepBookPool<TBase, TQuote>,
    deep_in: Coin<DEEP>,
    slippage_bps: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(slippage_bps < BPS_DENOM, EBadSlippage);

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

    // Slippage-protected expected outputs.
    //   maker sells filled_size base, expects ≥ filled_size * filled_price / 1e9 quote
    //   taker buys with quote, expects ≥ filled_size base
    let bps_left = (BPS_DENOM - slippage_bps) as u128;
    let expected_quote = ((filled_size as u128) * (filled_price as u128)) / FLOAT_SCALING;
    let min_quote_out = ((expected_quote * bps_left) / (BPS_DENOM as u128)) as u64;
    let min_base_out = ((((filled_size as u128) * bps_left) / (BPS_DENOM as u128))) as u64;

    // Split DEEP roughly in half so each swap has a budget for fees.
    let mut deep_a = deep_in;
    let deep_value = deep_a.value();
    let deep_b = coin::split(&mut deep_a, deep_value / 2, ctx);

    let maker_base: Coin<TBase> = coin::from_balance(maker_base_balance, ctx);
    let taker_quote: Coin<TQuote> = coin::from_balance(taker_quote_balance, ctx);

    // Leg 1 — maker sells base for quote.
    let (leftover_base_1, mut maker_quote, leftover_deep_1) =
        deepbook_pool::swap_exact_base_for_quote<TBase, TQuote>(
            pool,
            maker_base,
            deep_a,
            min_quote_out,
            clock,
            ctx,
        );

    // Leg 2 — taker buys base with quote. Roll the leftover DEEP forward.
    let mut deep_combined = deep_b;
    coin::join(&mut deep_combined, leftover_deep_1);
    let (mut taker_base, leftover_quote_2, leftover_deep_2) =
        deepbook_pool::swap_exact_quote_for_base<TBase, TQuote>(
            pool,
            taker_quote,
            deep_combined,
            min_base_out,
            clock,
            ctx,
        );

    // Hand each trader the asset they bought.
    // Fold tiny leftovers in (less than tick-size remainders from rounding):
    //   maker also gets leftover_quote_2 (extra quote from improved fill)
    //   taker also gets leftover_base_1  (extra base from improved fill)
    coin::join(&mut maker_quote, leftover_quote_2);
    coin::join(&mut taker_base, leftover_base_1);
    transfer::public_transfer(maker_quote, maker);
    transfer::public_transfer(taker_base, taker);

    // Refund DEEP dust to the enclave wallet.
    transfer::public_transfer(leftover_deep_2, ctx.sender());

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
