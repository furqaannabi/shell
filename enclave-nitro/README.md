# Shell — Nautilus app overlay

Source for the Shell Finance matching app that drops into the
[Nautilus](https://github.com/MystenLabs/nautilus) framework. The
upstream framework owns the runtime (EIF build, HTTP server,
attestation, key generation, AWS plumbing); the files here are the
*delta* — the per-app code that knows about Shell's order shape,
matching rules, and BCS layout.

See [`docs/aws-deployment.md`](../docs/aws-deployment.md) for the full
deployment runbook this overlay plugs into.

## Layout

```
enclave-nitro/
└── apps/
    └── shell/
        ├── mod.rs                 ← /process_data handler
        └── allowed_endpoints.yaml ← outbound URL allowlist
```

`mod.rs` is the Rust file Nautilus expects at
`src/nautilus-server/src/apps/shell/mod.rs`. `allowed_endpoints.yaml`
goes alongside it.

## Assembling the deployment tree

One command:

```bash
enclave-nitro/scripts/assemble.sh        # defaults to ~/nautilus
# or
enclave-nitro/scripts/assemble.sh ~/work/nautilus
```

The script clones `MystenLabs/nautilus` if missing, copies
[`apps/shell`](apps/shell) into `src/nautilus-server/src/apps/shell`,
adds the `shell = []` feature in `Cargo.toml`, and patches the two
`cfg` blocks in `lib.rs`. Idempotent — rerun-safe.

If you'd rather do it by hand, the three patches the script applies
are documented below.

### Manual patches (only if you skip assemble.sh)

**1. `nautilus-server/Cargo.toml`** — add a feature flag matching the
   `--features` flag `make ENCLAVE_APP=shell` will pass:

```toml
[features]
shell = []
```

**2. `nautilus-server/src/lib.rs`** — two cfg-gated lines mirroring
   how weather-example is registered:

```rust
mod apps {
    // … existing apps …
    #[cfg(feature = "shell")]
    #[path = "shell/mod.rs"]
    pub mod shell;
}

pub mod app {
    // … existing re-exports …
    #[cfg(feature = "shell")]
    pub use crate::apps::shell::*;
}
```

**3. Build with the feature on:** `make ENCLAVE_APP=shell` already
   does this — the Makefile passes `--features=$(ENCLAVE_APP)` to
   `cargo build`.

Once the three edits are in, `configure_enclave.sh shell` resolves to
the Shell app.

## Then follow the AWS runbook

[`docs/aws-deployment.md`](../docs/aws-deployment.md) walks through
provisioning, building the EIF, capturing PCRs, and registering the
enclave on-chain. Substitute these constants when prompted:

| Variable          | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `ENCLAVE_APP`     | `shell`                                                              |
| `MODULE_NAME`     | `shell`                                                              |
| `OTW_NAME`        | `SHELL`                                                              |
| `APP_PACKAGE_ID`  | `0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd` |
| `ENCLAVE_CONFIG`  | `0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f` |
| `CAP_OBJECT_ID`   | `0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c` |

## HTTP contract

`POST /process_data`

```json
{
  "payload": {
    "orders": [
      {
        "order_id": "0x…",
        "trader": "0x…",
        "plaintext": {
          "side": "buy",
          "size": 100,
          "limit_price": 12500,
          "expiry_epoch": 1200,
          "max_slippage_bps": 50
        }
      }
    ]
  }
}
```

Response:

```json
{
  "enclave_pubkey": "<hex>",
  "intent": 0,
  "timestamp_ms": 1750000000000,
  "matches": [
    {
      "envelope": { "intent": 0, "timestamp_ms": …, "data": { …MatchPayload… } },
      "signature": "<hex>"
    }
  ]
}
```

One independently-signed envelope per match. The Move side
(`shell::attestation::verify`) consumes each one separately to mint
the corresponding `MatchInstruction` hot-potato.

## Trust model (spike vs prod)

Today the handler accepts decrypted plaintexts from the caller. That's
fine for the offline-mode spike where the trader's SDK ships its own
plaintexts in over a side channel — the enclave's job is matching +
signing, not decryption.

For prod, the handler needs to:

1. Fetch `OrderCommitment` shared objects by id from Sui RPC.
2. Request Seal keys via `/v1/fetch_key`, gated by our
   `shell::shell::seal_approve` PTB.
3. AES-decrypt the `sealed_envelope` inside the enclave.
4. Verify each decrypted plaintext's SHA-256 against the on-chain
   `commit_hash`.
5. Match and sign.

That's still pending (#9, #10 in [`README.md`](../README.md)'s
"Pending" list). The wire shape of the response is identical; only the
input shape changes (caller sends an order-id list, not plaintexts).

## BCS layout anchor

The `match_payload_bcs_layout_pins_to_move` test in `mod.rs` pins the
on-the-wire BCS layout against a hand-computed reference that matches
`shell::attestation::MatchPayload`. Drift on either side trips the
test — the Nautilus app's BCS bytes must reconstruct exactly the same
input the Move side hashes inside `enclave::verify_signature`.
