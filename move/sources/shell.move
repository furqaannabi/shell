module shell::shell;

use enclave::enclave::{Self, Enclave};
use shell::pool;
use std::string;
use sui::address;
use sui::hash;

const ENotEnclave: u64 = 0;

/// One-time witness pinning every `enclave::*` generic in this package
/// to the SHELL instantiation.
public struct SHELL has drop {}

fun init(otw: SHELL, ctx: &mut TxContext) {
    let cap = enclave::new_cap(otw, ctx);
    cap.create_enclave_config(
        string::utf8(b"shell-finance enclave"),
        // Placeholder PCRs; admin loads real values post-deploy via
        // `enclave::update_pcrs` once the matching enclave is built.
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        x"000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
        ctx,
    );
    pool::create_pool(ctx);
    transfer::public_transfer(cap, ctx.sender());
}

/// Sui address derived from the enclave's raw ed25519 pubkey:
/// `blake2b256(0x00 || pk)`. The 0x00 byte is Sui's ed25519 scheme flag.
public fun enclave_address(enclave: &Enclave<SHELL>): address {
    let mut bytes = vector[0u8];
    bytes.append(*enclave.pk());
    address::from_bytes(hash::blake2b256(&bytes))
}

/// Seal policy gating decryption of a Shell order envelope.
///
/// Released only when the requester is the registered enclave. Seal's
/// key-server dry-run sets `ctx.sender()` to the wallet that signed the
/// fetch_key request, so this check authenticates the enclave by its
/// on-chain-registered signing key.
///
/// `id` is the Seal identity bytes (the per-order nonce the client
/// passed at encrypt time); it is not validated here — Seal already
/// derives a distinct IBE key per `(pkg, id)` pair.
entry fun seal_approve(_id: vector<u8>, enclave: &Enclave<SHELL>, ctx: &TxContext) {
    assert!(ctx.sender() == enclave_address(enclave), ENotEnclave);
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(SHELL {}, ctx)
}
