module shell::attestation;

use shell::pool::Pool;
use sui::bcs;
use sui::ed25519;

const EUnknownPcr: u64 = 0;
const EBadSignature: u64 = 1;

/// Output of a verified enclave match. Hot-potato: no `key`, `store`, `copy`,
/// or `drop` — it must be consumed by `shell::settlement` in the same PTB.
public struct MatchInstruction {
    maker: address,
    taker: address,
    maker_order: ID,
    taker_order: ID,
    filled_size: u64,
    filled_price: u64,
    deepbook_tx_digest: vector<u8>,
    enclave_signature: vector<u8>,
}

/// Verify that `signature` is a valid Ed25519 signature over `payload`
/// under the public key registered for `pcr`, then BCS-decode `payload`
/// into a `MatchInstruction`.
///
/// Payload layout (BCS): maker:address, taker:address, maker_order:address,
/// taker_order:address, filled_size:u64, filled_price:u64,
/// deepbook_tx_digest:vector<u8>.
public fun verify(
    pool: &Pool,
    pcr: vector<u8>,
    signature: vector<u8>,
    payload: vector<u8>,
): MatchInstruction {
    assert!(pool.is_pcr_registered(&pcr), EUnknownPcr);
    let pubkey = *pool.enclave_pubkey(&pcr);
    assert!(ed25519::ed25519_verify(&signature, &pubkey, &payload), EBadSignature);

    let mut reader = bcs::new(payload);
    let maker = reader.peel_address();
    let taker = reader.peel_address();
    let maker_order = object::id_from_address(reader.peel_address());
    let taker_order = object::id_from_address(reader.peel_address());
    let filled_size = reader.peel_u64();
    let filled_price = reader.peel_u64();
    let deepbook_tx_digest = reader.peel_vec_u8();

    MatchInstruction {
        maker,
        taker,
        maker_order,
        taker_order,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature: signature,
    }
}

public(package) fun unpack(
    instr: MatchInstruction,
): (address, address, ID, ID, u64, u64, vector<u8>, vector<u8>) {
    let MatchInstruction {
        maker,
        taker,
        maker_order,
        taker_order,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
    } = instr;
    (
        maker,
        taker,
        maker_order,
        taker_order,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
    )
}

#[test_only]
public fun new_for_testing(
    maker: address,
    taker: address,
    maker_order: ID,
    taker_order: ID,
    filled_size: u64,
    filled_price: u64,
    deepbook_tx_digest: vector<u8>,
    enclave_signature: vector<u8>,
): MatchInstruction {
    MatchInstruction {
        maker,
        taker,
        maker_order,
        taker_order,
        filled_size,
        filled_price,
        deepbook_tx_digest,
        enclave_signature,
    }
}
