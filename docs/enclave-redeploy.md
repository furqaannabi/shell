# Enclave redeploy runbook

You're about to push enclave Rust changes (`enclave-nitro/apps/shell/mod.rs` or
adjacent files), rebuild the EIF on EC2, replace the running enclave, and
re-register on chain. End-to-end this takes ~10–15 min once SSH is happy.

## When you need to do this

| Change touches | Do this runbook? |
| --- | --- |
| `enclave-nitro/apps/shell/mod.rs` or `nautilus/src/nautilus-server/src/apps/shell/mod.rs` | **yes** — EIF needs rebuild |
| `enclave-nitro/apps/shell/allowed_endpoints.yaml` | **yes** — EIF includes the yaml |
| `nautilus/src/nautilus-server/src/main.rs` or `run.sh` | **yes** |
| Move package (`move/sources/*.move`) | publish/upgrade — different runbook |
| Web / shell-agent / ts-sdk TypeScript only | no — just `git push`, vercel auto-deploys |
| `enclave-nitro/apps/shell/mod.rs` constants pointing at NEW package IDs | yes + you also need a fresh `register_enclave` against the new EnclaveConfig (see § "Fresh package republish") |

## Prereqs

You need:
1. SSH key for the EC2 host at `~/.ssh/shell-dev.pem` (chmod 600). Furqaan has the key in the Telegram pin.
2. `sui` CLI installed (testnet protocol ≥ v124 — `sui 1.72.2+`).
3. The `wonderful-cyanite` sui address active and funded with ≥ 0.2 SUI for the `update_pcrs` + `register_enclave` calls. Faucet via `curl -s -X POST https://faucet.testnet.sui.io/v2/gas -H "Content-Type: application/json" -d '{"FixedAmountRequest":{"recipient":"<addr>"}}'`.
4. The deployer key already loaded into your local sui keystore. If it's missing: ask Furqaan, then `sui keytool import <suiprivkey…> ed25519`.
5. Working internet to <https://sui.furqaannabi.com> (HTTPS) and SSH to `50.17.209.169` (port 22).

```bash
# Confirm prereqs
ls -la ~/.ssh/shell-dev.pem            # exists, 600
sui client active-address              # should be 0x8181e2f0…
sui client gas                         # ≥ 0.2 SUI
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 whoami   # prints ec2-user
curl -s https://sui.furqaannabi.com/health_check | head     # prints {"pk":"…"}
```

If SSH times out, fail2ban probably banned you. Wait 10–15 min, or ssh in via
EC2 Instance Connect from the AWS console once to refresh the allowlist.

## Anchor IDs (current testnet — keep in sync with [`ts-sdk/deployments/testnet.json`](../ts-sdk/deployments/testnet.json))

```
deployerAddr     0x8181e2f0ac453244328ba1862930ab884544f788fc2be30ebcbb3123b43e1740
enclaveAddr      0xeda60f47715ea94dae92a58467894f3882d18d8690a348df6e03b4e3cfef1114
enclavePk        0x6fea82e844451e5c029253ebb91428a08df4868c098a44ebc8289bb0ee114613   (persistent, derived from /home/ec2-user/enclave-seed.hex)

enclavePackageId  0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49   (Nautilus enclave framework, immutable)
shellPackageId    0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e   (Shell Move pkg — current republish)
poolId            0x33682a9652567989b094989fcabe9eda53fbde32c4a3e0204657a06510bab22b
enclaveConfigId   0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504
shellCapId        0x0c71e66d311f26a6dfa7ebbfb0dfc924439f503a5e7ac70280f92544c11770ef   (owned by deployer)
upgradeCapId      0x85f63ef069759e511e9d82281071978e71d9b0e2a15930bcf86dae02c02ced55
```

`Enclave<SHELL>` ID and PCR0/1 rotate every redeploy — the live values live
in `ts-sdk/deployments/testnet.json` and `web/src/lib/sui.ts`.

## Step-by-step

### 0. Sync the two local mod.rs copies

`enclave-nitro/apps/shell/mod.rs` is the canonical source. The build context
on EC2 reads from `nautilus/src/nautilus-server/src/apps/shell/mod.rs` — keep
them identical or git will complain.

```bash
cd c:/Users/furka/Hackathons/shell      # or wherever you cloned
diff enclave-nitro/apps/shell/mod.rs \
     nautilus/src/nautilus-server/src/apps/shell/mod.rs
# If they differ, copy enclave-nitro → nautilus:
cp enclave-nitro/apps/shell/mod.rs nautilus/src/nautilus-server/src/apps/shell/mod.rs
git diff --stat
```

### 1. scp the source onto EC2 + kick the build

```bash
scp -i ~/.ssh/shell-dev.pem -o StrictHostKeyChecking=no \
  enclave-nitro/apps/shell/mod.rs \
  ec2-user@50.17.209.169:nautilus/src/nautilus-server/src/apps/shell/mod.rs

# Also scp main.rs / run.sh / allowed_endpoints.yaml if you changed them.

ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'cd nautilus && rm -f out/nitro.eif out/nitro.pcrs out/rootfs.cpio && \
   sudo systemd-run --unit=enclave-rebuildX --no-block \
     -p WorkingDirectory=/home/ec2-user/nautilus \
     make ENCLAVE_APP=shell'
```

Pick a fresh unit name (`enclave-rebuild11`, …) so the journal stays
readable. Build takes 5–10 min; most of it is the cached Python 3.13 stage.

### 2. Wait for build + grab PCRs

```bash
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'sudo systemctl is-active enclave-rebuildX; \
   sudo systemctl show enclave-rebuildX --no-pager -p Result; \
   cat nautilus/out/nitro.pcrs'
```

Wait until `is-active` returns `inactive` AND `Result=success`. PCR0 +
PCR1 are identical 96-char hex strings; PCR2 is the standard
`0x21b9efbc…` AWS-Nitro initramfs hash that never changes.

Save PCR0 in your shell:
```bash
PCR=99495a3afaa4e5da2e8b47160f785bb24848d9149019f1a54cbe7eeb314eed1396da439563a16e3a2d503050b55461ce
# (use the actual value from your nitro.pcrs)
```

### 3. Terminate old enclave + run new + push secrets

```bash
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'EID=$(sudo nitro-cli describe-enclaves | jq -r ".[0].EnclaveID"); \
   if [ -n "$EID" ] && [ "$EID" != "null" ]; then \
     sudo nitro-cli terminate-enclave --enclave-id $EID; fi; \
   sudo pkill -f "socat TCP4-LISTEN:3000"; sleep 3'

# Now run the new enclave (do this as a separate ssh call — combining with
# the terminate above sometimes gets cut off by ssh):
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'sudo nitro-cli run-enclave --cpu-count 2 --memory 1024M \
     --eif-path /home/ec2-user/nautilus/out/nitro.eif'

# Push secrets (host-managed seed + current SHELL_ENCLAVE_ID into VSOCK,
# plus restart the socat that nginx proxies into the enclave on :3000):
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  "sleep 8 && sudo bash -c 'cd /home/ec2-user/nautilus && \
     nohup bash expose_enclave.sh > /tmp/expose-\$(date +%s).log 2>&1 < /dev/null &' && \
   sleep 25 && sudo ps aux | grep -E 'socat.*3000' | grep -v grep"
```

The expose script reads `/home/ec2-user/enclave-seed.hex` and the current
contents of `/home/ec2-user/shell-enclave-id.txt`, packs them with `API_KEY`
into a one-shot JSON blob, and dumps it into the enclave's VSOCK secrets
listener on CID:7777. The enclave parses the blob into env vars at boot.

Verify the persistent eph_kp survived (pk must read `0x6fea82e8…`):

```bash
curl -s https://sui.furqaannabi.com/health_check
# {"pk":"6fea82e844451e5c029253ebb91428a08df4868c098a44ebc8289bb0ee114613","endpoints_status":{}}
```

If the pk differs, the seed wasn't passed in — re-check `enclave-seed.hex`
exists and `expose_enclave.sh` ran cleanly (no `Connection reset` errors
in `/tmp/expose-*.log`).

### 4. `update_pcrs` on chain

```bash
PCR=99495a3afaa4e5da2e8b47160f785bb24848d9149019f1a54cbe7eeb314eed1396da439563a16e3a2d503050b55461ce
sui client switch --address wonderful-cyanite

sui client call \
  --package 0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49 \
  --module enclave \
  --function update_pcrs \
  --type-args 0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e::shell::SHELL \
  --args 0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504 \
         0x0c71e66d311f26a6dfa7ebbfb0dfc924439f503a5e7ac70280f92544c11770ef \
         0x$PCR \
         0x$PCR \
         0x21b9efbc184807662e966d34f390821309eeac6802309798826296bf3e8bec7c10edb30948c90ba67310f7b964fc500a \
  --gas-budget 100000000
```

### 5. `register_enclave` against the live attestation

```bash
bash nautilus/register_enclave.sh \
  0x8ecf22e78c90c3e32833d76d82415d7e4227ea370bec4efdad4c4830cbda9e49 \
  0x23d1e8b5b562bff7e30c69a20d2d0075074e3170898aa8bf9596de635764e36e \
  0x9ddc4bd22c4a84a7f02ac86d1a64530ecc768cb47df48dffd8d33803a096a504 \
  https://sui.furqaannabi.com \
  shell SHELL
```

Capture the new `Enclave<SHELL>` `ObjectID` (will look like `0x...` and
end in something like `…f48a` — *not* the gas coin id `0x4126…`):

```bash
NEW_ENCLAVE_ID=0x83fb0fd0aea65cd72b024b9564d9cd5b3c480f73eeb8201f7a6ecbdcad6352e6
# (read it from the script output)
```

### 6. Push the new SHELL_ENCLAVE_ID into the enclave + restart

The enclave reads its `SHELL_ENCLAVE_ID` only at boot, from the secrets blob.
So change the host file, terminate, run, expose again.

```bash
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  "echo $NEW_ENCLAVE_ID > /home/ec2-user/shell-enclave-id.txt && \
   EID=\$(sudo nitro-cli describe-enclaves | jq -r '.[0].EnclaveID') && \
   sudo nitro-cli terminate-enclave --enclave-id \$EID && \
   sudo pkill -f 'socat TCP4-LISTEN:3000'; sleep 3"

ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'sudo nitro-cli run-enclave --cpu-count 2 --memory 1024M \
     --eif-path /home/ec2-user/nautilus/out/nitro.eif'

ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  "sleep 8 && sudo bash -c 'cd /home/ec2-user/nautilus && \
     nohup bash expose_enclave.sh > /tmp/expose-\$(date +%s).log 2>&1 < /dev/null &' && \
   sleep 25 && sudo ps aux | grep -E 'socat.*3000' | grep -v grep"
```

### 7. Verify

```bash
curl -s https://sui.furqaannabi.com/health_check
# {"pk":"6fea82e8…","endpoints_status":{}}     ← pk must be 6fea82e8…

curl -s https://sui.furqaannabi.com/shell/status
# {"order_poller_last_ok_ms": <recent>, "ioi_matcher_last_ok_ms": <recent>,
#  "order_book_size": <≥0>, "ioi_book_size": <≥0>, "proposed_pairs": <≥0>}
```

`order_poller_last_ok_ms` should advance every ~5s; `ioi_matcher_last_ok_ms`
every ~15s (and stays at 0 only while the matcher's startup bootstrap is
still paginating past `MatchProposed` events from chain — normal for the
first 1–2 minutes after a restart on a populated package).

Tail the journal once more for a sanity check:

```bash
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  'sudo journalctl -k --since "2 min ago" --no-pager | tail -50'
```

### 8. Update client configs + commit

Three files reference the rotating values:

| File | Field |
| --- | --- |
| `ts-sdk/deployments/testnet.json` | `enclaveId`, `enclavePcr0`, `enclavePcr1`, `previousEnclaveId` (roll the old one here) |
| `web/src/lib/sui.ts` | `TESTNET.enclaveId` |
| `shell-agent/src/config.ts` | `enclaveId` literal |

```bash
# After editing, commit + push.
git add ts-sdk/deployments/testnet.json web/src/lib/sui.ts shell-agent/src/config.ts
git commit -m "enclave: redeploy <reason>; new Enclave<SHELL>

Rebuilt EIF off <commit ref / change summary>. New PCR0/1 0x<short>...;
update_pcrs + register_enclave minted Enclave<SHELL> at <full id> on
package 0x23d1e8b5…. Persistent eph_kp pk 0x6fea82e8… intact.
/shell/status healthy."
git push
```

Vercel auto-deploys the web from `main`. The enclave is already live —
the commit is just documentation.

---

## Fresh package republish (rare — last done 2026-05-24)

If you're not just redeploying the enclave but actually publishing a **new
shell package** (e.g. because stale `OrderCommitment`s are poisoning the
matcher), follow [`republish-brief.md`](republish-brief.md) instead. After
the publish you still run this runbook from Step 1, but you also have to
update the enclave's hardcoded constants in `mod.rs` (the SHELL_PACKAGE_ID*
+ event-type strings) before scp + rebuild.

---

## Troubleshooting

### `ssh: Connection refused` or timeout

Fail2ban likely banned your IP after too many failed SSH attempts. Either:
- Wait 10–15 min and retry.
- SSH in once via the AWS Console → EC2 Instance Connect, which re-pushes
  your key and refreshes the allowlist.
- Verify with `nslookup sui.furqaannabi.com` that DNS still points at
  `50.17.209.169`. If the IP changed (EC2 stop/start), update the runbook.

### `health_check` returns pk other than `0x6fea82e8…`

The persistent seed didn't reach the enclave. Causes:
- `/home/ec2-user/enclave-seed.hex` missing or empty → regenerate:
  `openssl rand -hex 32 > /home/ec2-user/enclave-seed.hex && chmod 600 …`.
  **Heads up**: a new seed = new pk = old `Enclave<SHELL>` is now invalid
  on chain. You'll need a fresh `register_enclave`.
- `expose_enclave.sh` ran *before* the enclave's VSOCK secrets listener
  was up. Look at `/tmp/expose-*.log` — if you see
  `connect(5, AF=40 cid:..., port:7777): Connection reset by peer`, the
  push happened too early. Restart the enclave (terminate + run-enclave)
  then re-run `expose_enclave.sh` with the `sleep 8` before it.

### `update_pcrs` aborts with `EUnauthorizedCap`

You're signing with the wrong wallet. The `Cap<SHELL>`
(`0x0c71e66d…`) is owned by `wonderful-cyanite`
(`0x8181e2f0…`). Run `sui client switch --address wonderful-cyanite`
and retry.

### `register_enclave.sh` aborts with `EInvalidAttestation`

The PCR set on chain doesn't match what the live enclave is signing with.
Either:
- You skipped `update_pcrs` — go back to Step 4.
- The PCR you copied from `nitro.pcrs` is from a *previous* build that's
  already been overwritten — re-read the file.

### `/shell/status` `ioi_matcher_last_ok_ms` stays 0 forever

The bootstrap loop is paginating through too many historical
`MatchProposed` events. Symptoms: `proposed_pairs` climbing rapidly,
`ioi_matcher_last_ok_ms` still 0 after 5 min. Workaround: terminate +
relaunch on a clean package (the next published version restarts the
event history). Real fix: cap the bootstrap to events ≤ `PROPOSAL_EXPIRY_MS`
old at the *query* level (currently filters client-side after the page
arrives). Tracked in [README §"Honest list"](../README.md#honest-list--whats-not-shipped).

### nautilus build fails with `Cannot find gas coin for signer with amount sufficient for the required gas budget`

Faucet the deployer. Wait 30–60s, retry.

### Multiple `socat` processes on port 3000

Bad cleanup. Kill them all then re-run expose:
```bash
ssh -i ~/.ssh/shell-dev.pem ec2-user@50.17.209.169 \
  "sudo pkill -9 -f 'socat TCP4-LISTEN:3000'; sleep 2"
```

---

## After you ship

Drop the new `Enclave<SHELL>` id + PCR0 + commit sha into the team chat
so the front-end engineer can verify their local `web/src/lib/sui.ts`
matches what's deployed.
