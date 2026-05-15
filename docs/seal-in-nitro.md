# Closing the side-channel: Seal-in-Nitro

The current `enclave-nitro/apps/shell/mod.rs` accepts decrypted order plaintexts from the caller. That's the "offline-mode" shape — the trader's SDK ships plaintexts over a side channel rather than the enclave fetching Seal-encrypted ciphertexts and decrypting in-TEE. This doc scopes the work to close that gap.

## Why it matters

Without this, the threat model has a hole:
- **Today**: anyone who can hit `/process_data` can submit fake plaintexts and get the enclave to sign matches for orders that don't exist on-chain. The Move side catches this (the orders named in the signed `MatchPayload` are looked up and consumed; if they don't exist, `settle` aborts). But the enclave will *sign anything it's told*.
- **With Seal-in-Nitro**: the enclave never accepts plaintexts. It pulls the `OrderCommitment` shared object by ID, fetches Seal key shares (gated by `shell::shell::seal_approve`), and decrypts inside the TEE. The signing key only signs matches over plaintexts the enclave itself decrypted.

That's the difference between "the enclave trusts its caller" and "the enclave trusts only the Sui chain + Seal key servers."

## What changes in our code

### `shell::shell::seal_approve` — no change

Already correct:

```move
entry fun seal_approve(_id: vector<u8>, enclave: &Enclave<SHELL>, ctx: &TxContext) {
    assert!(ctx.sender() == enclave_address(enclave), ENotEnclave);
}
```

The Seal key server's dry-run sees `ctx.sender()` = the wallet that signed the `fetch_key` request. The enclave signs that request with its on-chain-registered Ed25519 key. The derived address must match. Per-order identity bytes flow through `_id` (already unused by the policy because per-`(pkg, id)` IBE derivation already isolates each order).

### TS SDK — no change

`encryptOrder()` already encrypts to a random 32-byte id and prefixes it onto the on-chain `sealed_envelope`. The enclave reads the id back off the envelope and feeds it into `fetch_key`. Wire format is fine as-is.

### Move `OrderCommitment` — no change

Already stores `sealed_envelope: vector<u8>` opaque. Enclave fetches by `object_id`.

### `enclave-nitro/apps/shell/` — substantial changes

This is the work.

## Reference implementation

Mysten's [`apps/seal-example/`](https://github.com/MystenLabs/nautilus/tree/main/src/nautilus-server/src/apps/seal-example) ships a working Rust Seal client running inside Nitro. Pattern:

1. **Enclave-internal ElGamal keypair** generated on boot, never leaves the TEE.
2. **Host-mediated `fetch_key` forwarding**. Enclave generates a signed `FetchKeyRequest`, hands it to the host over VSOCK, host POSTs it to the Seal aggregator URL, host returns the encrypted response over VSOCK.
3. **Decrypt + combine shares** with the in-enclave ElGamal secret key.
4. **AES-GCM** the resulting symmetric key against the on-chain ciphertext.
5. Cache decrypted plaintexts keyed by object id; evict after `expiry_epoch`.

The example uses three endpoints (`init_seal_key_load`, `complete_seal_key_load`, `provision_weather_api_key`) to walk the host through the request/response dance. Shell would collapse to one — `process_data` takes `Vec<order_id>`, does the dance internally for each, runs the matcher, returns signed matches.

## Architectural shape, side-by-side

| Step | Today (side-channel) | With Seal-in-Nitro |
| --- | --- | --- |
| `/process_data` input | `{ orders: [{ id, trader, plaintext }] }` | `{ order_ids: ["0x..", ...] }` |
| Trust on caller | sees plaintexts | only sees order IDs |
| RPC calls from enclave | none | `sui_getObject` per order, `fetch_key` per order |
| In-enclave crypto | Ed25519 sign | + ElGamal decrypt, AES-GCM, IBE share combine |
| Caching | none | per-order, expiry-bounded |

## Concrete subtasks

1. **Port `endpoints.rs` from seal-example** (~10KB). Generic plumbing; adapt the wallet-PK signing payload to use the same `IntentMessage`/`SHELL` OTW path.
2. **Wire host-side VSOCK forwarder** for `fetch_key` HTTP. Mirror the seal-example's host-side helper script.
3. **Fetch `OrderCommitment` objects** via Sui RPC. The host already gives the enclave a route to `fullnode.testnet.sui.io` via the traffic forwarder we put in `allowed_endpoints.yaml`. Use `reqwest` over the loopback domain.
4. **PTB construction inside the enclave**. Build the dry-run PTB calling `shell::shell::seal_approve(id, &Enclave<SHELL>, ctx)`. The Seal API needs raw tx bytes. Reuse `fastcrypto::ed25519` for signing.
5. **AES-GCM decrypt** the sealed envelope. The trader's SDK uses Seal's hybrid scheme — we need to match its DEM choice (look at `@mysten/seal`'s `DemType` default; currently `AesGcm256` IIRC).
6. **Verify `commit_hash`** post-decrypt: SHA-256 of BCS plaintext must match the `OrderCommitment.commit_hash`. Aborts the match if any decryption was tampered. This is the integrity guarantee the offline path skips.
7. **Test inside the enclave** with a recorded real-network fetch_key response (seal-example shows how).
8. **Rebuild EIF, capture new PCRs, `update_pcrs`, re-`register_enclave`.**

## Crypto dependencies (Rust)

All available via `fastcrypto`, already in `nautilus-server`'s deps:

- `fastcrypto::groups::bls12381` — for IBE share combination
- `fastcrypto::aes::AesGcm256` — for envelope decrypt
- `fastcrypto::ed25519::Ed25519KeyPair` — already in use
- `fastcrypto::traits::ToFromBytes` — already in use

No new external Rust crates required.

## Estimate

3–5 focused days. Roughly:

- **Day 1**: port seal-example types + endpoints, get the enclave booting with the ElGamal keypair generated.
- **Day 2**: wire host-side VSOCK forwarder + `sui_getObject` path.
- **Day 3**: per-order decrypt path end-to-end, prove a single order works.
- **Day 4**: caching, error paths, concurrent-request safety.
- **Day 5**: integration tests + PCR rebuild + re-register.

## What to ship between now and then

For the hackathon submission, the side-channel demo is honest if labelled correctly:

> "The trader's SDK currently hands plaintexts to the enclave over HTTP. The prod path — `enclave fetches ciphertext from Sui + Seal shares from key servers + decrypts in-TEE` — is scoped in [docs/seal-in-nitro.md](docs/seal-in-nitro.md), reuses Mysten's reference implementation in [apps/seal-example](https://github.com/MystenLabs/nautilus/tree/main/src/nautilus-server/src/apps/seal-example), and is the immediate post-hackathon priority."

That's the threat-model honesty Mysten judges have rewarded.

## What this unblocks

Once shipped, the full chain runs without operator trust:

1. Trader encrypts an order under Seal with a random per-order id. On-chain.
2. Enclave watches `OrderSubmitted` events, fetches each `OrderCommitment` by id.
3. Enclave dry-run-signs a `seal_approve` PTB with its on-chain-pinned key.
4. Seal returns IBE shares only if the PTB passes (i.e. caller-address == registered-enclave-address).
5. Enclave decrypts inside the TEE, verifies SHA-256 commit hash, runs matcher, signs match.
6. Settlement PTB on-chain consumes the hot-potato and mints receipts.

No path through this requires trusting the operator's host, the host's network, or anyone other than (Sui consensus + Seal key servers + AWS Nitro hardware). That trust set was the goal in [product.md §5](../product.md).
