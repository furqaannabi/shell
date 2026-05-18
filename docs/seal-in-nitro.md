# Seal-in-Nitro: how the autonomous loop is wired

The Shell enclave runs an autonomous matching loop entirely inside the TEE: it watches Sui for sealed orders, fetches Seal key shares, decrypts the envelopes in-enclave, runs price-time matching, and submits the settlement PTB itself. The trader, the host, and the operator never see the plaintexts and never sign anything on the enclave's behalf.

This doc is a walkthrough of how that loop is wired in [`enclave-nitro/apps/shell/mod.rs`](../enclave-nitro/apps/shell/mod.rs).

## The threat model this closes

- **What the enclave used to trust**: its caller. The old `/process_data` handler took decrypted plaintexts over HTTP and signed matches against whatever it was told.
- **What the enclave now trusts**: only the Sui chain + Seal key servers + AWS Nitro hardware. The enclave reads ciphertexts off Sui, requests Seal key shares (which only release if the on-chain `shell::shell::seal_approve` policy passes), decrypts in-TEE, and signs matches over plaintexts it decrypted itself.

That difference is the load-bearing privacy guarantee.

## The loop

`start_poller` (mod.rs) spawns a background tokio task on enclave boot. Each tick (~5s):

1. **Watch.** Poll `suix_queryEvents` for new `shell::pool::OrderSubmitted` events, advance the cursor.
2. **Fetch.** For each event, `sui_getObject` on the `OrderCommitment` shared object — yields `sealed_envelope: vector<u8>`, `commit_hash: vector<u8>`, the `T` from `OrderCommitment<T>`.
3. **Decrypt.** Build a `seal_approve` PTB, sign with the enclave's eph_kp, POST to `https://seal-aggregator-testnet.mystenlabs.com/v1/fetch_key`. Seal's key servers dry-run the PTB; if it passes, they return ElGamal-encrypted IBE key shares. The enclave combines shares and AES-GCM-decrypts the envelope inside the TEE.
4. **Verify.** SHA-256 the BCS-decoded plaintext, check it equals the on-chain `commit_hash`. If not, abort — the envelope was tampered.
5. **Match.** Insert into the in-enclave price-time order book. If a counterparty exists, emit a `MatchPayload`.
6. **Sign + submit.** Build a `Transaction` with `attestation::verify(...) → settlement::settle<TMaker, TTaker>(...)` chained, sign with `sui-crypto::SuiSigner`, BCS-serialize, submit via `sui_executeTransactionBlock`. Two `SettlementReceipt`s land on-chain.

Nothing in steps 3–6 leaves the enclave's address space until step 6's RPC call.

## Why `shell::shell::seal_approve` is the load-bearing policy

```move
entry fun seal_approve(_id: vector<u8>, enclave: &Enclave<SHELL>, ctx: &TxContext) {
    assert!(ctx.sender() == enclave_address(enclave), ENotEnclave);
}
```

Seal's key servers run this Move function as a dry-run against the PTB the requester submits. `ctx.sender()` in that dry-run is set to the address derived from the certificate's signing key — i.e. whatever pubkey signed the `fetch_key` request. The assertion forces that to equal `blake2b256(0x00 || enclave.pk)`, where `enclave.pk` is the on-chain-registered Ed25519 pubkey baked into the `Enclave<SHELL>` shared object at `register_enclave` time.

So: only an entity holding the private key that was bound on-chain during registration can get Seal to release key shares. That's what makes the policy enforceable cryptographically rather than procedurally.

## Why eph_kp needs to be persistent

Out of the box, the Nautilus framework regenerates `eph_kp` on every enclave boot. That would invalidate the on-chain registration after every reboot — the new pubkey wouldn't match `enclave.pk`, and `seal_approve` would abort with `ENotEnclave`.

The framework patch in [`enclave-nitro/framework-patches/main.rs`](../enclave-nitro/framework-patches/main.rs) replaces the random generation with:

```rust
let eph_kp = match std::env::var("ENCLAVE_KEY_SEED") {
    Ok(hex) => Ed25519KeyPair::from_bytes(&Hex::decode(&hex)?)?,
    Err(_) => Ed25519KeyPair::generate(&mut rand::thread_rng()),
};
```

`ENCLAVE_KEY_SEED` is a 32-byte hex string stored on the EC2 host at `/home/ec2-user/enclave-seed.hex` (mode 600) and pushed into the enclave via the existing secrets-blob channel in `expose_enclave.sh`. The seed is host-managed but it never appears in source control or attestation; what's bound on-chain is the *derived public key*. As long as the host doesn't lose the file, the enclave's signing identity is stable across reboots — and one on-chain `register_enclave` call covers all subsequent boots.

If the seed file is lost or rotated, the operator runs `register_enclave` again. The previous `Enclave<SHELL>` object stays addressable but its policy stops authenticating the new boots.

## Wire-format details that took a debug loop to find

The runtime issues that bit the integration, all fixed in [commit 4b90d7f](../) and verified end-to-end:

- Sui RPC returns `vector<u8>` Move fields as **JSON arrays of numbers**, not hex strings. `sealed_envelope`, `commit_hash`, and the Seal `KeyServerV2.pk` all needed an `as_array()` parse path. `parse_bytes_field` in mod.rs handles both shapes.
- The Seal key server's `KeyServer` parent object has no `pk` field directly — the actual pubkey lives in a versioned `KeyServerV2` dynamic-field child. `ensure_server_pubkey` walks `suix_getDynamicFields` to find it.
- `data.owner.Shared.initial_shared_version` comes back as a JSON **number**, not a quoted string.
- The Seal aggregator requires `Client-Sdk-Type: rust` and `Client-Sdk-Version: <semver>` headers; without them you get `InvalidSDKType: 400`.
- The settlement PTB cannot be hand-rolled JSON — `sui_executeTransactionBlock` expects BCS-encoded `TransactionData`. The first byte of a JSON `{` is `123`, which BCS reads as an out-of-range enum variant tag and rejects.

These are the kind of corners that don't show up in TS SDK examples; the Rust path through the same APIs surfaces them directly.

## Files of interest

| File | Role |
| --- | --- |
| [`enclave-nitro/apps/shell/mod.rs`](../enclave-nitro/apps/shell/mod.rs) | `/process_data` handler, autonomous poller, decrypt path, PTB builders, settle submitter. |
| [`enclave-nitro/framework-patches/main.rs`](../enclave-nitro/framework-patches/main.rs) | Persistent eph_kp via `ENCLAVE_KEY_SEED`. |
| [`nautilus/expose_enclave.sh`](../nautilus/expose_enclave.sh) | Pushes `{API_KEY, ENCLAVE_KEY_SEED}` to the enclave over VSOCK at boot. |
| [`move/sources/shell.move`](../move/sources/shell.move) | `seal_approve` policy + `enclave_address` derivation. |
| [`move/sources/attestation.move`](../move/sources/attestation.move) | `MatchPayload` BCS schema + `verify` → `MatchInstruction` hot-potato. |
| [`move/sources/settlement.move`](../move/sources/settlement.move) | `settle<TMaker, TTaker>` consumes the hot-potato + both orders. |

## What's still on the side

- **DeepBook v3 settlement leg.** `settlement::settle` currently does a direct collateral swap. Spec calls for `place_limit_order<Base, Quote>` against a real DeepBook pool with a per-trader `BalanceManager`.
- **Partial fills.** The matcher is whole-fill only; partials are out of scope for v1.
- **Prod-mode PCRs.** The running enclave is debug-mode (zero PCRs). The build and registration scripts are identical for prod; the demo box is debug-pinned to keep the iteration loop fast.
