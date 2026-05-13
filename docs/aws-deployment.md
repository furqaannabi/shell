# Deploying the Shell matching enclave on AWS Nitro

End-to-end runbook for standing up the Nautilus enclave on AWS, then wiring it onto Sui testnet so `shell::attestation::verify` and `shell::settlement::settle` can run against a real `Enclave<SHELL>` object.

This guide is grounded in [MystenLabs/nautilus](https://github.com/MystenLabs/nautilus) — the `UsingNautilus.md`, `register_enclave.sh`, `expose_enclave.sh`, and `configure_enclave.sh` reference scripts. Cross-check there if any command here drifts.

## What AWS gives us

The single thing we need from AWS is a verifiable attestation document. The four-stage flow:

1. We build the matcher into an Enclave Image File (EIF). The build is deterministic — same source, same bytes, same PCRs.
2. We launch the EIF inside a Nitro Enclave on an EC2 host. The enclave generates an Ed25519 signing key *inside* the enclosure; the private key never leaves.
3. The enclave can produce an attestation document on demand. The doc embeds the PCR set, the enclave's public key, and an AWS-rooted x509 chain.
4. We ship the attestation doc to Sui. `enclave::register_enclave` checks the PCRs match our `EnclaveConfig`, validates the x509 chain on-chain via `sui::nitro_attestation`, extracts the pubkey, and mints a shared `Enclave<SHELL>` object.

From that point, any match the enclave signs verifies against the on-chain pubkey, and `shell::settlement::settle` runs.

## Prerequisites

**AWS account state**
- Region with Nitro Enclaves available (us-east-1, us-west-2, eu-west-1, etc. — most major regions).
- IAM permissions to launch EC2, create security groups, create instance profiles, and put objects in AWS Secrets Manager.
- A keypair for SSH to the EC2 host.

**EC2 instance**
- Must support Nitro Enclaves: m5n, m5dn, m6i, r5n, r5dn, c5n, c6i, c7i, etc. — Nitro-based families with vCPU allocations reservable for the enclave.
- Minimum sane size: `m6i.xlarge` (4 vCPU / 16 GiB; allocate 2 vCPU / 4 GiB to the enclave). For testnet demo this is plenty.
- Launch with `--enclave-options Enabled=true`.
- Open the security group on TCP/3000 inbound (the Nautilus HTTP forwarder port) from your testing IP only. Restrict to the world only behind a fronting ALB/Cloudflare in real use.

**Tooling on the EC2 host**
- Amazon Linux 2023 or Ubuntu 22.04.
- `nitro-cli`, `docker`, `socat`, `jq`. Install order: `dnf install -y aws-nitro-enclaves-cli aws-nitro-enclaves-cli-devel docker socat jq` (Amazon Linux) or the Ubuntu equivalents.
- Add your user to `docker` and `ne` groups, then `sudo systemctl enable --now nitro-enclaves-allocator docker`.

**Sui-side state (already in place from our testnet publish)**
- Package: `0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd`
- `EnclaveConfig<SHELL>`: `0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f`
- `Cap<SHELL>` (owned by the deployer wallet): `0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c`

## Step 1 — Restructure code into the Nautilus app pattern

This is the only step that requires code changes. The Nautilus framework expects an HTTP server with three endpoints (`/health_check`, `/get_attestation`, `/process_data`). The runnable matcher needs to live under `src/nautilus-server/src/apps/<app>/` per the upstream pattern.

What that means for [enclave/](../enclave/):

- The existing `match-and-sign` binary stays as the offline-mode tool.
- A new app at `src/nautilus-server/src/apps/shell/` wraps the matcher + signer as an HTTP `/process_data` handler that accepts incoming order batches, returns signed `MatchPayload`s.
- `allowed_endpoints.yaml` lists which outbound URLs the enclave is allowed to call (Sui testnet RPC, Seal aggregator URL).
- Existing tests stay in our crate; the Nautilus app re-exports the matcher.

Two practical options for laying this out:

**A. Fork `MystenLabs/nautilus`** and drop the shell app inside. Fastest, matches Mysten's canonical scaffold. Repo cost: our code lives in a fork. Recommended for the hackathon.

**B. Vendor the Nautilus scaffold** (`Containerfile`, `expose_enclave.sh`, `register_enclave.sh`, etc.) into our repo and keep the matcher where it is. More work upfront, cleaner ownership long-term.

Pick A for the demo. We can always migrate later.

## Step 2 — Build the EIF, capture PCRs

On a dev box (Linux preferred; macOS via Docker also works):

```bash
git clone https://github.com/<you>/nautilus.git
cd nautilus
# Drop the shell app under src/nautilus-server/src/apps/shell/
# Update Cargo.toml to feature-gate the app.

make build  # produces nautilus-server.eif
nitro-cli describe-eif --eif-path nautilus-server.eif
```

The describe output lists `Measurements.PCR0/PCR1/PCR2` — three 48-byte hex strings. Capture all three; the rest of the flow depends on them.

Reproducibility check: a second machine running the same git rev should produce the same PCRs. If they drift, something non-deterministic leaked in (timestamp, build user, env vars). Treat that as a blocker — non-reproducible PCRs mean we cannot trust the binary.

## Step 3 — Provision EC2 and run the enclave

```bash
# Launch a Nitro-enabled instance with the host AMI of your choice.
aws ec2 run-instances \
  --image-id <amzn-linux-2023-ami> \
  --instance-type m6i.xlarge \
  --enclave-options 'Enabled=true' \
  --key-name <your-key> \
  --security-group-ids <sg-with-3000-open> \
  --iam-instance-profile Name=<profile-with-secrets-read>

# SSH in, install tooling (above), copy the .eif over, then:
nitro-cli run-enclave \
  --eif-path nautilus-server.eif \
  --cpu-count 2 \
  --memory 4096 \
  --enclave-cid 16 \
  --debug-mode   # drop --debug-mode for prod; debug-mode PCRs are different!

./expose_enclave.sh    # bridges TCP:3000 → VSOCK using socat
```

`expose_enclave.sh` expects a `secrets.json` in the working directory — for Shell we don't need real secrets, but the script will pipe whatever's there into VSOCK:7777 at startup. Put an empty `{}` if nothing's needed.

**Critical**: debug-mode (`--debug-mode`) produces *different* PCRs than production mode (PCR0 differs). For testnet you can run in debug mode while iterating, but registration will fail if the EnclaveConfig was set against prod-mode PCRs. Pick one mode and stick with it through the whole flow.

Validate it's alive:

```bash
curl http://<ec2-public-ip>:3000/health_check
curl http://<ec2-public-ip>:3000/get_attestation > attestation.hex
```

The attestation hex is what Step 5 will submit to Sui.

## Step 4 — Update PCRs on the Shell `EnclaveConfig`

Our config currently holds placeholder all-zero PCRs. Update with the captured values:

```bash
sui client call \
  --package <enclave-package-id-on-testnet> \
  --module enclave \
  --function update_pcrs \
  --type-args "0x5a47e786…::shell::SHELL" \
  --args \
    0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f \
    0x1c8bbd85b6dbc1bb0c35f97c24155cf896d9bbd041bd75c8ad519a13c7cee87c \
    "[<pcr0-hex>]" "[<pcr1-hex>]" "[<pcr2-hex>]"
```

`<enclave-package-id-on-testnet>` is the address `enclave` resolved to when we co-deployed (visible in [`move/Move.lock`](../move/Move.lock) or by inspecting `objectType` on the `Cap<SHELL>` object).

After this call, `EnclaveConfig.version` bumps; old `Enclave<SHELL>` instances (if any) become invalid and can be cleaned up via `enclave::destroy_old_enclave`.

## Step 5 — Register the enclave on-chain

The Nautilus `register_enclave.sh` does the heavy lifting. With the attestation hex from Step 3:

```bash
./register_enclave.sh \
  <enclave-package-id> \
  0x5a47e78620e79a131bb8115a8f9e41f0bba0e387ec4c0ed93514853bd9987fbd \
  0x741c7a6cf78930ca2dea0d3188749be18585d286e5c28bfdef007aff3468f41f \
  http://<ec2-public-ip>:3000 \
  shell \
  SHELL
```

The script fetches `/get_attestation` itself, BCS-encodes it as `vector<u8>`, and submits the PTB calling `nitro_attestation::load_nitro_attestation` → `enclave::register_enclave`. If everything matches, you get a shared `Enclave<SHELL>` object id back. **Save it** — every settlement PTB will reference this.

If the PTB aborts: the most common cause is PCR mismatch (debug-mode vs prod, or stale config). Re-derive the EIF and rerun Step 4.

## Step 6 — Wire the enclave URL into clients

Add the EC2 URL to [ts-sdk/deployments/testnet.json](../ts-sdk/deployments/testnet.json) and to [web/src/lib/sui.ts](../web/src/lib/sui.ts) so the FE can:
1. Display "matcher: online" health.
2. Hand the settlement PTB the right `Enclave<SHELL>` object id when calling `attestation::verify`.

Also flip `seal_approve` from offline-mode test fixtures to the real `Enclave<SHELL>` ref in the decryption PTB the trader's wallet signs to recover their own order.

## Costs and timing

- `m6i.xlarge` on-demand: ~$0.19/hr in us-east-1. Spot is ~$0.07/hr. Leaving it running 24/7 is ~$4–$140/month depending on spot vs on-demand.
- Build time for the EIF: 5–15 minutes on a cold Docker cache.
- AWS Secrets Manager: optional, free tier covers our use.
- Sui gas for `update_pcrs` + `register_enclave`: under 0.1 SUI total.

Plan: ~one full day of focused work, of which ~half is the code restructure in Step 1 and the other half is AWS infrastructure debugging (security groups, IAM, debug-mode-vs-prod PCRs).

## What I (Claude Code) can do for you

In the repo, autonomously:
- The Step 1 restructure — fork the Nautilus repo, drop in the Shell app, wire the matcher into `/process_data`.
- Update the `Move.lock`-resolved enclave package id into [docs/aws-deployment.md](#) and the FE deployments JSON once the enclave URL is known.
- Write the build/test commands you'll run on the host.

Outside Claude (you must do hands-on):
- Anything that touches the AWS console / CLI under your account.
- SSH'ing into EC2 to run `nitro-cli`.
- Producing the EIF and capturing PCRs (deterministic build means I could in principle, but it needs Docker + a specific toolchain that's awkward to set up here).

If you want me to start on Step 1 (the fork + Shell-app restructure), say go and I'll do it as a parallel branch / worktree so the current `enclave/` layout stays unchanged until you flip the switch.

## When you'll know it worked

The proof is a single end-to-end run:

1. Trader submits a Seal-encrypted order via the web app.
2. The enclave (HTTP) fetches the ciphertext, requests Seal keys (gated by our `seal_approve`), decrypts, runs the matcher, signs a `MatchPayload`.
3. A settlement PTB submitted on testnet calls `shell::attestation::verify` → `shell::settlement::settle`, succeeds, mints two `SettlementReceipt` objects.

That's the GO criterion from [product.md §6.2](../product.md).
