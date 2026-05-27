/// Mock tokenized T-Bill for testnet demos.
/// 1 TBILL = 1 USDC (fixed NAV). 6 decimals.
/// On mainnet replace with real Ondo USDY / Franklin BENJI coin type.
module rwa_mock::tbill;

use sui::coin;

public struct TBILL has drop {}

fun init(witness: TBILL, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"TBILL",
        b"Mock T-Bill",
        b"Testnet mock for a tokenized US Treasury Bill. 1 TBILL = 1 USDC.",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender());
}

/// Mint TBILL to any address. Treasury cap held by deployer.
public entry fun mint(
    treasury: &mut coin::TreasuryCap<TBILL>,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    coin::mint_and_transfer(treasury, amount, recipient, ctx);
}
