module shell::settlement;

use shell::attestation::{Self, MatchInstruction};
use shell::pool::{Self, OrderCommitment};
use sui::coin;

const EOrderMismatch: u64 = 0;
const ETraderMismatch: u64 = 1;

/// Consume a verified `MatchInstruction` atomically with both
/// `OrderCommitment`s it names. Swaps escrowed collateral between
/// the two traders and mints a `SettlementReceipt` to each.
///
/// For the spike, "settlement" is just a collateral swap. The DeepBook
/// v3 leg is wired in week 4 per `product.md` §6.1.
public fun settle<TMaker, TTaker>(
    instruction: MatchInstruction,
    maker_order: OrderCommitment<TMaker>,
    taker_order: OrderCommitment<TTaker>,
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

    let (maker_trader, _, maker_collateral) = pool::consume(maker_order);
    let (taker_trader, _, taker_collateral) = pool::consume(taker_order);
    assert!(maker_trader == maker, ETraderMismatch);
    assert!(taker_trader == taker, ETraderMismatch);

    transfer::public_transfer(coin::from_balance(maker_collateral, ctx), taker);
    transfer::public_transfer(coin::from_balance(taker_collateral, ctx), maker);

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
