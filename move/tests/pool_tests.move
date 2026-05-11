#[test_only]
module shell::pool_tests;

use shell::pool::{Self, Pool, AdminCap, OrderCommitment};
use sui::coin;
use sui::sui::SUI;
use sui::test_scenario as ts;

const ADMIN: address = @0xA;
const TRADER: address = @0xB;
const OTHER: address = @0xC;

const PCR_A: vector<u8> = b"pcr-binary-a-32-bytes-padding---";
const PCR_B: vector<u8> = b"pcr-binary-b-32-bytes-padding---";
const PUBKEY: vector<u8> = b"ed25519-pubkey-32-bytes-padding-";
const ENV: vector<u8> = b"sealed-ciphertext-bytes";
const HASH: vector<u8> = b"commit-hash-32-bytes-padding----";

#[test]
fun init_shares_pool_and_mints_admin_cap() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());
    s.next_tx(ADMIN);

    let pool = s.take_shared<Pool>();
    let cap = s.take_from_address<AdminCap>(ADMIN);
    let pcr = PCR_A;
    assert!(!pool.is_pcr_registered(&pcr));

    ts::return_shared(pool);
    ts::return_to_address(ADMIN, cap);
    s.end();
}

#[test]
fun register_and_deregister_pcr() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());
    s.next_tx(ADMIN);

    let mut pool = s.take_shared<Pool>();
    let cap = s.take_from_address<AdminCap>(ADMIN);

    let pcr = PCR_A;
    let pubkey = PUBKEY;
    pool.register_enclave(&cap, pcr, pubkey);
    assert!(pool.is_pcr_registered(&pcr));
    assert!(pool.enclave_pubkey(&pcr) == &pubkey);

    pool.deregister_enclave(&cap, pcr);
    assert!(!pool.is_pcr_registered(&pcr));

    ts::return_shared(pool);
    ts::return_to_address(ADMIN, cap);
    s.end();
}

#[test, expected_failure(abort_code = pool::EPcrAlreadyRegistered)]
fun register_pcr_twice_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());
    s.next_tx(ADMIN);

    let mut pool = s.take_shared<Pool>();
    let cap = s.take_from_address<AdminCap>(ADMIN);
    pool.register_enclave(&cap, PCR_A, PUBKEY);
    pool.register_enclave(&cap, PCR_A, PUBKEY);

    abort 0
}

#[test, expected_failure(abort_code = pool::EPcrNotRegistered)]
fun deregister_unknown_pcr_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());
    s.next_tx(ADMIN);

    let mut pool = s.take_shared<Pool>();
    let cap = s.take_from_address<AdminCap>(ADMIN);
    pool.deregister_enclave(&cap, PCR_B);

    abort 0
}

#[test]
fun submit_order_shares_commitment() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(1_000_000, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 5, s.ctx());

    s.next_tx(TRADER);
    let order = s.take_shared<OrderCommitment<SUI>>();
    ts::return_shared(order);
    s.end();
}

#[test, expected_failure(abort_code = pool::EOrderExpired)]
fun submit_order_with_past_expiry_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(1_000_000, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 0, s.ctx());

    abort 0
}

#[test, expected_failure(abort_code = pool::EZeroCollateral)]
fun submit_order_with_zero_collateral_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(0, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 5, s.ctx());

    abort 0
}

#[test]
fun cancel_expired_returns_collateral() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(777, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 1, s.ctx());

    // Advance two epochs to pass expiry.
    s.next_epoch(TRADER);
    s.next_epoch(TRADER);

    let order = s.take_shared<OrderCommitment<SUI>>();
    let refund = pool::cancel_expired<SUI>(order, s.ctx());
    assert!(refund.value() == 777);
    refund.burn_for_testing();
    s.end();
}

#[test, expected_failure(abort_code = pool::EWrongTrader)]
fun cancel_by_non_trader_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(100, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 1, s.ctx());

    s.next_epoch(OTHER);
    s.next_epoch(OTHER);

    let order = s.take_shared<OrderCommitment<SUI>>();
    let refund = pool::cancel_expired<SUI>(order, s.ctx());
    refund.burn_for_testing();
    abort 0
}

#[test, expected_failure(abort_code = pool::EOrderNotExpired)]
fun cancel_before_expiry_aborts() {
    let mut s = ts::begin(ADMIN);
    pool::init_for_testing(s.ctx());

    s.next_tx(TRADER);
    let coin = coin::mint_for_testing<SUI>(100, s.ctx());
    pool::submit_order<SUI>(ENV, HASH, coin, /* expiry */ 10, s.ctx());

    s.next_tx(TRADER);
    let order = s.take_shared<OrderCommitment<SUI>>();
    let refund = pool::cancel_expired<SUI>(order, s.ctx());
    refund.burn_for_testing();
    abort 0
}
