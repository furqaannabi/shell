#[test_only]
module shell::settlement_tests;

use shell::attestation;
use shell::pool::{Self, OrderCommitment, SettlementReceipt};
use shell::settlement;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;

public struct USDC has drop {}

const MAKER: address = @0x1;
const TAKER: address = @0x2;

const ENV: vector<u8> = b"sealed";
const HASH: vector<u8> = b"hash----------------------------";
const DBTX: vector<u8> = b"db-tx-digest";
const SIG: vector<u8> = b"sig-bytes-irrelevant-for-test";

fun submit_order_as<T>(s: &mut ts::Scenario, who: address, amount: u64, expiry: u64): ID {
    s.next_tx(who);
    let collat = coin::mint_for_testing<T>(amount, s.ctx());
    pool::submit_order<T>(ENV, HASH, collat, expiry, s.ctx());
    s.next_tx(who);
    let order = s.take_shared<OrderCommitment<T>>();
    let id = object::id(&order);
    ts::return_shared(order);
    id
}

#[test]
fun settle_swaps_collateral_and_mints_two_receipts() {
    let mut s = ts::begin(MAKER);
    pool::init_for_testing(s.ctx());

    let maker_id = submit_order_as<SUI>(&mut s, MAKER, 100, 10);
    let taker_id = submit_order_as<USDC>(&mut s, TAKER, 250, 10);

    let instr = attestation::new_for_testing(
        MAKER,
        TAKER,
        maker_id,
        taker_id,
        100,
        2_500,
        DBTX,
        SIG,
    );

    s.next_tx(MAKER);
    let maker_order = s.take_shared<OrderCommitment<SUI>>();
    let taker_order = s.take_shared<OrderCommitment<USDC>>();
    settlement::settle<SUI, USDC>(instr, maker_order, taker_order, s.ctx());

    s.next_tx(MAKER);
    let maker_usdc = s.take_from_address<Coin<USDC>>(MAKER);
    assert!(maker_usdc.value() == 250);
    let maker_receipt = s.take_from_address<SettlementReceipt>(MAKER);

    s.next_tx(TAKER);
    let taker_sui = s.take_from_address<Coin<SUI>>(TAKER);
    assert!(taker_sui.value() == 100);
    let taker_receipt = s.take_from_address<SettlementReceipt>(TAKER);

    coin::burn_for_testing(maker_usdc);
    coin::burn_for_testing(taker_sui);
    ts::return_to_address(MAKER, maker_receipt);
    ts::return_to_address(TAKER, taker_receipt);
    s.end();
}

#[test, expected_failure(abort_code = settlement::EOrderMismatch)]
fun settle_rejects_wrong_maker_order_id() {
    let mut s = ts::begin(MAKER);
    pool::init_for_testing(s.ctx());

    let _real_maker_id = submit_order_as<SUI>(&mut s, MAKER, 100, 10);
    let taker_id = submit_order_as<USDC>(&mut s, TAKER, 250, 10);

    // Lie about which maker order the instruction names.
    let fake_id = object::id_from_address(@0xDEAD);
    let instr = attestation::new_for_testing(
        MAKER, TAKER, fake_id, taker_id, 100, 2_500, DBTX, SIG,
    );

    s.next_tx(MAKER);
    let maker_order = s.take_shared<OrderCommitment<SUI>>();
    let taker_order = s.take_shared<OrderCommitment<USDC>>();
    settlement::settle<SUI, USDC>(instr, maker_order, taker_order, s.ctx());
    abort 0
}

#[test, expected_failure(abort_code = settlement::ETraderMismatch)]
fun settle_rejects_wrong_trader_address() {
    let mut s = ts::begin(MAKER);
    pool::init_for_testing(s.ctx());

    let maker_id = submit_order_as<SUI>(&mut s, MAKER, 100, 10);
    let taker_id = submit_order_as<USDC>(&mut s, TAKER, 250, 10);

    // Instruction names wrong maker address.
    let instr = attestation::new_for_testing(
        @0xBAD, TAKER, maker_id, taker_id, 100, 2_500, DBTX, SIG,
    );

    s.next_tx(MAKER);
    let maker_order = s.take_shared<OrderCommitment<SUI>>();
    let taker_order = s.take_shared<OrderCommitment<USDC>>();
    settlement::settle<SUI, USDC>(instr, maker_order, taker_order, s.ctx());
    abort 0
}
