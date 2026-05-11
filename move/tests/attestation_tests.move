#[test_only]
module shell::attestation_tests;

use shell::attestation;
use shell::pool::{Self, Pool, AdminCap};
use sui::test_scenario as ts;

const ADMIN: address = @0xA;
const PCR: vector<u8> = b"pcr-binary-32-bytes-padding-----";
const WRONG_PCR: vector<u8> = b"pcr-other-32-bytes-padding------";

// Test vector generated offline via Node 24 `crypto.generateKeyPairSync('ed25519')`.
// Payload BCS-encodes: maker=0xAA*32, taker=0xBB*32, maker_order=0xCC*32,
// taker_order=0xDD*32, filled_size=1000, filled_price=500,
// deepbook_tx_digest=b"db-tx-digest".
const PUBKEY: vector<u8> =
    x"e2b8d5a8b6df7f8ac6ec5e8ccdc9fb2a42db52b17ff607cc28fdd43223d1aa98";
const PAYLOAD: vector<u8> =
    x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddde803000000000000f4010000000000000c64622d74782d646967657374";
const SIGNATURE: vector<u8> =
    x"69be42e23ba7e66d3021cb2d5f528da323ff0c78bbf751f5847ec7fca4860b316af5b4568b43cc109039086017e359b84e0583b473a17d1c3b994d383a6ff107";

fun setup_pool_with_enclave(s: &mut ts::Scenario, pcr: vector<u8>, pubkey: vector<u8>) {
    pool::init_for_testing(s.ctx());
    s.next_tx(ADMIN);
    let mut pool = s.take_shared<Pool>();
    let cap = s.take_from_address<AdminCap>(ADMIN);
    pool.register_enclave(&cap, pcr, pubkey);
    ts::return_shared(pool);
    ts::return_to_address(ADMIN, cap);
    s.next_tx(ADMIN);
}

#[test]
fun verify_decodes_payload() {
    let mut s = ts::begin(ADMIN);
    setup_pool_with_enclave(&mut s, PCR, PUBKEY);

    let pool = s.take_shared<Pool>();
    let instr = attestation::verify(&pool, PCR, SIGNATURE, PAYLOAD);
    let (maker, taker, maker_order, taker_order, size, price, dbtx, sig) =
        attestation::unpack(instr);

    let aaa = @0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa;
    let bbb = @0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb;
    let ccc = @0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc;
    let ddd = @0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd;

    assert!(maker == aaa);
    assert!(taker == bbb);
    assert!(maker_order == object::id_from_address(ccc));
    assert!(taker_order == object::id_from_address(ddd));
    assert!(size == 1000);
    assert!(price == 500);
    assert!(dbtx == b"db-tx-digest");
    assert!(sig == SIGNATURE);

    ts::return_shared(pool);
    s.end();
}

#[test, expected_failure(abort_code = attestation::EUnknownPcr)]
fun verify_rejects_unregistered_pcr() {
    let mut s = ts::begin(ADMIN);
    setup_pool_with_enclave(&mut s, PCR, PUBKEY);

    let pool = s.take_shared<Pool>();
    attestation::unpack(attestation::verify(&pool, WRONG_PCR, SIGNATURE, PAYLOAD));
    abort 0
}

#[test, expected_failure(abort_code = attestation::EBadSignature)]
fun verify_rejects_bad_signature() {
    let mut s = ts::begin(ADMIN);
    setup_pool_with_enclave(&mut s, PCR, PUBKEY);

    let pool = s.take_shared<Pool>();
    let mut bad = SIGNATURE;
    *vector::borrow_mut(&mut bad, 0) = 0; // flip a byte
    attestation::unpack(attestation::verify(&pool, PCR, bad, PAYLOAD));
    abort 0
}

#[test, expected_failure(abort_code = attestation::EBadSignature)]
fun verify_rejects_tampered_payload() {
    let mut s = ts::begin(ADMIN);
    setup_pool_with_enclave(&mut s, PCR, PUBKEY);

    let pool = s.take_shared<Pool>();
    let mut tampered = PAYLOAD;
    *vector::borrow_mut(&mut tampered, 0) = 0; // change maker addr byte
    attestation::unpack(attestation::verify(&pool, PCR, SIGNATURE, tampered));
    abort 0
}
