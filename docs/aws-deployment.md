# Deploying the Shell matching enclave on AWS Nitro

Shell-specific runbook for the AWS deployment. Follow the upstream [Using Nautilus](https://docs.sui.io/concepts/cryptography/nautilus/using-nautilus) guide for the generic steps (AWS SSO, EC2 key pairs, `configure_enclave.sh` flags, troubleshooting). This doc is the Shell-flavoured delta: what changes, what's already done, what to type with our specific object IDs.

## What's already in place

- Shell Move package: `0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd` (testnet)
- Upstream `enclave` package (co-deployed): resolved in [`move/Move.lock`](../move/Move.lock); inspect the `Cap<SHELL>` object's type tag on testnet to confirm
- `Cap<SHELL>`: `0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c` (owned by the deployer)
- `EnclaveConfig<SHELL>`: `0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f` (shared, currently holds all-zero placeholder PCRs)

The all-zero PCRs are *intentional* — they make the debug-mode shortcut below trivial. Don't change them unless you're going prod-mode.

## Two paths

The Nautilus guide names two modes. For the hackathon, decide upfront:

| | Debug / dev mode | Prod mode |
| --- | --- | --- |
| `make` target on EC2 | `make run-debug` | `make run` |
| PCR values | all zeros | real measurements of the EIF |
| Attestation guarantee | none (zeros) | real AWS-signed attestation |
| Demo-only OK? | yes | required for any honest pitch |
| EC2 cost | needed for the one-time attestation fetch | needed continuously |
| Code path for matcher | inject deterministic key, run anywhere | runs only inside the enclave |

**Recommended for the spike GO criterion**: dev mode. Spin up a Nitro instance briefly to fetch *one* debug-mode attestation doc with all-zero PCRs, run `register_enclave` once, then run the actual matcher locally with the same injected key. The on-chain side accepts the resulting signatures because the pubkey was registered correctly. Cost: a few cents. Caveat: the pitch must clearly say "dev-mode enclave, prod-mode is the next-day task" — Mysten judges reward honesty about TEE caveats.

**For the real pitch demo video**: prod mode. The PCRs are non-zero, the AWS x509 chain is real, and the on-chain `nitro_attestation::load_nitro_attestation` verification is meaningful.

## Prerequisites

Per [Using Nautilus § Prerequisites](https://docs.sui.io/concepts/cryptography/nautilus/using-nautilus#prerequisites):
- AWS CLI v2, Rust + cargo, Make, Sui CLI, clone of `MystenLabs/nautilus`
- AWS SSO configured (`aws configure sso`), creds exported via `aws configure export-credentials --format env`
- Region with Nitro Enclaves (us-east-1 is the default the upstream scripts assume; set `REGION` and `AMI_ID` env vars if elsewhere)

Already installed on this box: sui CLI 1.71, cargo 1.90, Node 24. Missing: AWS CLI v2 — install before starting.

## Step 1 — Assemble the Nautilus tree

The overlay at [enclave-nitro/apps/shell/](../enclave-nitro/) drops into a Nautilus checkout. One command does it:

```bash
enclave-nitro/scripts/assemble.sh        # clones into ~/nautilus
# or pick your own path:
enclave-nitro/scripts/assemble.sh ~/work/nautilus
```

What it does (and what you'd otherwise do by hand — see [enclave-nitro/README.md](../enclave-nitro/README.md) for the manual recipe):

1. Clones (or updates) `MystenLabs/nautilus`.
2. Copies `apps/shell/mod.rs` + `allowed_endpoints.yaml` into `src/nautilus-server/src/apps/shell/`.
3. Adds `shell = []` to `nautilus-server/Cargo.toml` `[features]`.
4. Adds the two `cfg(feature = "shell")` blocks to `nautilus-server/src/lib.rs`.

Idempotent — rerun-safe.

## Step 2 — Provision the EC2 instance

From the cloned Nautilus repo root:

```bash
sh configure_enclave.sh shell
```

The script will prompt for an instance base name and offer to store secrets in AWS Secrets Manager (Shell doesn't need any for now — answer `n`). It launches the EC2, allocates the enclave, builds the EIF, configures the endpoint forwarding, and modifies `src/nautilus-server/run.sh` + `expose_enclave.sh` locally with the resolved domain routing.

Output to capture:
- Instance ID (for `stop-instances` later)
- Public IP — this becomes `ENCLAVE_URL` on-chain

Wait 2–3 minutes for first boot.

## Step 3 — rsync, SSH, build, run

The local file mutations from Step 2 need to land on the EC2 host:

```bash
rsync -avz -e "ssh -i ~/.ssh/<your-alias>.pem" ./ ec2-user@<public-ip>:~/nautilus/
ssh -i ~/.ssh/<your-alias>.pem ec2-user@<public-ip>
```

### One-time: generate the enclave key seed

The matcher's signing key is derived from a host-managed 32-byte seed
(see [enclave-nitro/README.md](../enclave-nitro/README.md#persistent-enclave-key)
for the rationale). Generate it once per deployment:

```bash
openssl rand -hex 32 > /home/ec2-user/enclave-seed.hex
chmod 600 /home/ec2-user/enclave-seed.hex
```

`expose_enclave.sh` reads this file and pushes the seed plus a placeholder
`API_KEY` to the enclave through the existing VSOCK secrets channel. The
patched framework `main.rs` consumes it before constructing `eph_kp`.

If the seed file is missing, `expose_enclave.sh` exits with a clear
error; if it's present but you boot without expose, the enclave will
fall back to a random keypair (and your on-chain registration won't
authenticate).

### Build + run the enclave

```bash
cd nautilus
make ENCLAVE_APP=shell
make run-debug   # dev mode → all-zero PCRs
# OR
make run         # prod mode → real PCRs

sh expose_enclave.sh
```

Validate from your dev box:

```bash
curl http://<public-ip>:3000/health_check
curl http://<public-ip>:3000/get_attestation > attestation.hex
```

For prod mode, capture the PCRs:

```bash
cat out/nitro.pcrs   # on the EC2 host
export PCR0=...
export PCR1=...
export PCR2=...
```

Dev mode skips this — PCRs are already zeros in our `EnclaveConfig<SHELL>`.

## Step 4 — Update PCRs (prod mode only)

If you ran `make run-debug`, **skip this**. If you ran `make run`:

```bash
ENCLAVE_PACKAGE_ID=<from move/Move.lock or by inspecting Cap<SHELL>::type>
APP_PACKAGE_ID=0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd
CAP_OBJECT_ID=0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c
ENCLAVE_CONFIG_OBJECT_ID=0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f

sui client call \
  --function update_pcrs \
  --module enclave \
  --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::shell::SHELL" \
  --args $ENCLAVE_CONFIG_OBJECT_ID $CAP_OBJECT_ID \
        0x$PCR0 0x$PCR1 0x$PCR2
```

Optional rename:

```bash
sui client call \
  --function update_name --module enclave --package $ENCLAVE_PACKAGE_ID \
  --type-args "$APP_PACKAGE_ID::shell::SHELL" \
  --args $ENCLAVE_CONFIG_OBJECT_ID $CAP_OBJECT_ID "shell enclave v1"
```

## Step 5 — Register the enclave on-chain

Use the upstream `register_enclave.sh`. From the Nautilus repo:

```bash
ENCLAVE_URL=http://<public-ip>:3000
MODULE_NAME=shell
OTW_NAME=SHELL

sh register_enclave.sh \
  $ENCLAVE_PACKAGE_ID \
  $APP_PACKAGE_ID \
  $ENCLAVE_CONFIG_OBJECT_ID \
  $ENCLAVE_URL \
  $MODULE_NAME \
  $OTW_NAME
```

Save the resulting `ENCLAVE_OBJECT_ID` — every settlement PTB will reference this.

## Step 6 — Wire IDs into Shell clients

Three places to update:

1. [ts-sdk/deployments/testnet.json](../ts-sdk/deployments/testnet.json):
   ```json
   "enclaveId": "0x…",
   "enclaveUrl": "http://<public-ip>:3000"
   ```
2. [web/src/lib/sui.ts](../web/src/lib/sui.ts) — `TESTNET.enclaveId` and `TESTNET.enclaveUrl`.
3. [enclave-nitro/apps/shell/mod.rs](../enclave-nitro/apps/shell/mod.rs) — `ENCLAVE_ID` constant. The autonomous poller references this when building the `seal_approve` PTB; if it points at a stale `Enclave<SHELL>` object the on-chain policy will reject every `fetch_key` request with `ENotEnclave`.

After updating `mod.rs`, rebuild and reboot the enclave. Because `eph_kp`
is seed-derived (Step 3), the new build keeps the same signing key — no
need to re-run `register_enclave`.

## Step 7 — Stop EC2 when idle

```bash
aws ec2 stop-instances --instance-ids <instance-id>
```

`m6i.xlarge` on-demand is ~$0.19/hr. Leave it stopped between demo runs and `aws ec2 start-instances` when needed.

To return:

```bash
ssh -i ~/.ssh/<your-alias>.pem ec2-user@<public-ip>
cd nautilus
make ENCLAVE_APP=shell
make run     # or run-debug
sh expose_enclave.sh
```

## When you'll know it worked

The autonomous loop is live when:

1. Trader submits a Seal-encrypted order via the web app.
2. The enclave's poller (visible in `/tmp/console-*.log` if you launched with `--attach-console`) picks up the `OrderSubmitted` event within ~5s.
3. The poller's log shows a `[shell] settled:` line with a real Sui tx digest.
4. The corresponding `SettlementReceipt` objects exist under the trader and counterparty addresses on testnet.

Wire-format details and the debug-loop findings live in
[`docs/seal-in-nitro.md`](seal-in-nitro.md).

## Honest dev-mode caveat

Dev mode lets us check off the GO criterion *mechanically* — every layer runs, including the `nitro_attestation::load_nitro_attestation` step on-chain. But the PCRs are zero, which means the on-chain check that "this enclave is running the expected binary" is vacuous. The threat-model story in [product.md §5](../product.md) requires prod-mode PCRs to be honest. Plan one prod-mode run before submission; the pitch should explicitly note when the demo was recorded against dev vs prod.

## Troubleshooting pointers

These are in the [upstream guide](https://docs.sui.io/concepts/cryptography/nautilus/using-nautilus#troubleshooting); not duplicated here:
- Traffic forwarder error → check `allowed_endpoints.yaml`
- SSO expired → `aws sso login` + re-export creds
- rsync permission denied → fix `~/.ssh/*.pem` perms to 400
- Enclave endpoint unreachable → confirm `expose_enclave.sh` is running

## What I (Claude Code) can do for you

In-repo, autonomously:
- Patch [ts-sdk/deployments/testnet.json](../ts-sdk/deployments/testnet.json) and [web/src/lib/sui.ts](../web/src/lib/sui.ts) once you have the URL + enclave object ID.
- Update the [enclave-nitro/apps/shell/mod.rs](../enclave-nitro/apps/shell/mod.rs) handler when the input shape changes (e.g. when Seal-in-Nitro lands and we switch from accepting plaintexts to accepting order IDs).

Hands-on (your AWS console / EC2):
- AWS SSO setup, EC2 key pair, `configure_enclave.sh`, rsync, `make run`, capturing PCRs, `register_enclave.sh`, `stop-instances`.

Say go on Step 1 and I'll start the fork + `apps/shell/` restructure on a branch.
