module shell::pool;

use sui::balance::Balance;
use sui::coin::{Self, Coin};
use sui::event;
use sui::vec_map::{Self, VecMap};

const EPcrAlreadyRegistered: u64 = 0;
const EPcrNotRegistered: u64 = 1;
const EOrderExpired: u64 = 2;
const EOrderNotExpired: u64 = 3;
const EWrongTrader: u64 = 4;
const EZeroCollateral: u64 = 5;

public struct AdminCap has key, store {
    id: UID,
}

public struct Pool has key {
    id: UID,
    enclaves: VecMap<vector<u8>, vector<u8>>,
    epoch_window_ms: u64,
    protocol_fee_bps: u64,
    treasury: address,
}

public struct OrderCommitment<phantom T> has key {
    id: UID,
    trader: address,
    sealed_envelope: vector<u8>,
    commit_hash: vector<u8>,
    collateral: Balance<T>,
    expiry_epoch: u64,
}

public struct SettlementReceipt has key, store {
    id: UID,
    trader: address,
    counterparty: address,
    filled_size: u64,
    filled_price: u64,
    deepbook_tx_digest: vector<u8>,
    enclave_signature: vector<u8>,
}

public struct OrderSubmitted has copy, drop {
    order_id: ID,
    trader: address,
    commit_hash: vector<u8>,
    expiry_epoch: u64,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Pool {
        id: object::new(ctx),
        enclaves: vec_map::empty(),
        epoch_window_ms: 10_000,
        protocol_fee_bps: 10,
        treasury: ctx.sender(),
    });
    transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
}

public fun register_enclave(
    pool: &mut Pool,
    _: &AdminCap,
    pcr: vector<u8>,
    enclave_pubkey: vector<u8>,
) {
    assert!(!pool.enclaves.contains(&pcr), EPcrAlreadyRegistered);
    pool.enclaves.insert(pcr, enclave_pubkey);
}

public fun deregister_enclave(pool: &mut Pool, _: &AdminCap, pcr: vector<u8>) {
    assert!(pool.enclaves.contains(&pcr), EPcrNotRegistered);
    pool.enclaves.remove(&pcr);
}

public fun is_pcr_registered(pool: &Pool, pcr: &vector<u8>): bool {
    pool.enclaves.contains(pcr)
}

public fun enclave_pubkey(pool: &Pool, pcr: &vector<u8>): &vector<u8> {
    pool.enclaves.get(pcr)
}

public fun submit_order<T>(
    sealed_envelope: vector<u8>,
    commit_hash: vector<u8>,
    collateral: Coin<T>,
    expiry_epoch: u64,
    ctx: &mut TxContext,
) {
    assert!(expiry_epoch > ctx.epoch(), EOrderExpired);
    assert!(collateral.value() > 0, EZeroCollateral);
    let order = OrderCommitment<T> {
        id: object::new(ctx),
        trader: ctx.sender(),
        sealed_envelope,
        commit_hash,
        collateral: collateral.into_balance(),
        expiry_epoch,
    };
    event::emit(OrderSubmitted {
        order_id: object::id(&order),
        trader: ctx.sender(),
        commit_hash: order.commit_hash,
        expiry_epoch,
    });
    transfer::share_object(order);
}

public fun cancel_expired<T>(order: OrderCommitment<T>, ctx: &mut TxContext): Coin<T> {
    assert!(order.trader == ctx.sender(), EWrongTrader);
    assert!(ctx.epoch() >= order.expiry_epoch, EOrderNotExpired);
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

public(package) fun consume<T>(order: OrderCommitment<T>): (address, vector<u8>, Balance<T>) {
    let OrderCommitment {
        id,
        trader,
        sealed_envelope: _,
        commit_hash,
        collateral,
        expiry_epoch: _,
    } = order;
    id.delete();
    (trader, commit_hash, collateral)
}

public(package) fun new_receipt(
    trader: address,
    counterparty: address,
    filled_size: u64,
    filled_price: u64,
    deepbook_tx_digest: vector<u8>,
    enclave_signature: vector<u8>,
    ctx: &mut TxContext,
): SettlementReceipt {
    SettlementReceipt {
        id: object::new(ctx),
        trader,
        counterparty,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
    }
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx)
}
