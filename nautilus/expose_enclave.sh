# Copyright (c), Mysten Labs, Inc.
# SPDX-License-Identifier: Apache-2.0
#!/bin/bash

# Gets the enclave id and CID
# expects there to be only one enclave running
ENCLAVE_ID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveID")
ENCLAVE_CID=$(nitro-cli describe-enclaves | jq -r ".[0].EnclaveCID")

sleep 5
# Secrets-block
# API_KEY is a placeholder for non-Shell apps; the Shell handler does not
# consume it. ENCLAVE_KEY_SEED is a host-managed 32-byte hex seed that the
# patched framework feeds into Ed25519KeyPair::from_bytes so the enclave's
# signing identity (and on-chain Enclave<T>.pk registration) survives reboots.
SEED_FILE="${SEED_FILE:-/home/ec2-user/enclave-seed.hex}"
if [[ ! -f "$SEED_FILE" ]]; then
    echo "FATAL: $SEED_FILE missing — generate with: openssl rand -hex 32 > $SEED_FILE && chmod 600 $SEED_FILE" >&2
    exit 1
fi
SEED="$(tr -d '\n' < "$SEED_FILE")"

# Optional: override the compile-time DEFAULT_ENCLAVE_ID with whatever
# Enclave<SHELL> shared object is currently active on-chain. Lets a
# prod-mode re-registration land without rebuilding the EIF.
ENCLAVE_ID_FILE="${ENCLAVE_ID_FILE:-/home/ec2-user/shell-enclave-id.txt}"
if [[ -f "$ENCLAVE_ID_FILE" ]]; then
    SHELL_ENCLAVE_ID="$(tr -d '\n[:space:]' < "$ENCLAVE_ID_FILE")"
    jq -n --arg seed "$SEED" --arg eid "$SHELL_ENCLAVE_ID" \
        '{API_KEY: "shell-dummy", ENCLAVE_KEY_SEED: $seed, SHELL_ENCLAVE_ID: $eid}' \
        > secrets.json
else
    jq -n --arg seed "$SEED" \
        '{API_KEY: "shell-dummy", ENCLAVE_KEY_SEED: $seed}' \
        > secrets.json
fi

cat secrets.json | socat - VSOCK-CONNECT:$ENCLAVE_CID:7777
socat TCP4-LISTEN:3000,reuseaddr,fork VSOCK-CONNECT:$ENCLAVE_CID:3000 &

# Additional port configurations will be added here by configure_enclave.sh if needed
