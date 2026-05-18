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
├── apps/shell/
│   ├── mod.rs                 ← autonomous matcher + /process_data
│   └── allowed_endpoints.yaml ← outbound URL allowlist
├── framework-patches/
│   ├── lib.rs                 ← AppState shell field + cfg gating
│   └── main.rs                ← persistent eph_kp via ENCLAVE_KEY_SEED
└── scripts/
    └── assemble.sh            ← stitches the above into a Nautilus checkout
```

The framework-patches are overlaid wholesale (not in-place patches): the
autonomous poller needs an `AppState.shell` field and a `start_poller`
call from `main`, and the persistent eph_kp lives in the framework's
`main.rs` ahead of `AppState` construction.

## Assembling the deployment tree

One command:

```bash
enclave-nitro/scripts/assemble.sh        # defaults to ~/nautilus
# or
enclave-nitro/scripts/assemble.sh ~/work/nautilus
```

The script clones `MystenLabs/nautilus` if missing, copies
[`apps/shell`](apps/shell) into `src/nautilus-server/src/apps/shell`,
patches `Cargo.toml`'s `shell` feature to pull `sui-crypto`,
`sui-sdk-types`, and `seal-sdk`, and overlays the patched `lib.rs` +
`main.rs` from [`framework-patches/`](framework-patches/). Idempotent —
rerun-safe.

## Persistent enclave key

The matcher signs settlement transactions with `eph_kp`. The on-chain
`Enclave<SHELL>.pk` is bound to that pubkey during `register_enclave`,
and `shell::shell::seal_approve` enforces that only this pubkey can
request Seal key shares. If `eph_kp` changed on every boot, the on-chain
registration would invalidate immediately.

The patched `main.rs` reads `ENCLAVE_KEY_SEED` (32-byte hex) from env,
derives `eph_kp` deterministically, and falls back to a random keypair
when the seed is unset (preserving the upstream demo apps' behavior).

The host stores the seed at `/home/ec2-user/enclave-seed.hex` (mode 600)
and pushes it through the existing secrets-blob VSOCK channel —
[`nautilus/expose_enclave.sh`](../nautilus/expose_enclave.sh) handles
this:

```bash
openssl rand -hex 32 > /home/ec2-user/enclave-seed.hex
chmod 600 /home/ec2-user/enclave-seed.hex
```

Generate once per deployment. Reboot the enclave as many times as you
like; the registered pubkey stays valid.

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

## Operating mode: autonomous

The enclave runs an autonomous matching loop. On boot, `start_poller`
spawns a tokio task that polls Sui for `OrderSubmitted` events, fetches
each `OrderCommitment`, requests Seal key shares (gated by
`shell::shell::seal_approve`), decrypts in-TEE, runs price-time matching,
and submits the settlement `Transaction` itself. No external trigger
needed.

The HTTP server is still up for liveness checks and a hybrid manual mode:

| Endpoint | Use |
| --- | --- |
| `GET /health_check` | liveness probe |
| `GET /get_attestation` | hex-encoded AWS-signed attestation doc; used by `register_enclave.sh` |
| `POST /process_data` | manual one-shot: pass `order_ids` (preferred) or `orders` with plaintexts (legacy side-channel) and the matcher runs once on that input |

The frontend and SDK don't call `/process_data` in the autonomous path —
sealed orders go straight to Sui and the poller picks them up. The
endpoint is kept for tests and recovery scenarios.

For the wire-format details that took a debug loop to find, see
[`docs/seal-in-nitro.md`](../docs/seal-in-nitro.md).

## BCS layout anchor

The `match_payload_bcs_layout_pins_to_move` test in `mod.rs` pins the
on-the-wire BCS layout against a hand-computed reference that matches
`shell::attestation::MatchPayload`. Drift on either side trips the
test — the Nautilus app's BCS bytes must reconstruct exactly the same
input the Move side hashes inside `enclave::verify_signature`.
