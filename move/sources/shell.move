module shell::shell;

use enclave::enclave;
use shell::pool;
use std::string;

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

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(SHELL {}, ctx)
}
