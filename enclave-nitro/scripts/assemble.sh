#!/usr/bin/env bash
# Assemble a MystenLabs/nautilus checkout with the Shell app overlay
# applied, ready for `sh configure_enclave.sh shell`.
#
# Idempotent: rerun-safe. Each patch checks for its sentinel first.
#
# Usage:
#   enclave-nitro/scripts/assemble.sh [NAUTILUS_DIR]
#
# Default NAUTILUS_DIR is ~/nautilus.

set -euo pipefail

NAUTILUS_DIR="${1:-$HOME/nautilus}"
NAUTILUS_REPO="https://github.com/MystenLabs/nautilus.git"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OVERLAY="$SCRIPT_DIR/../apps/shell"
FRAMEWORK_PATCHES="$SCRIPT_DIR/../framework-patches"

# ── Step 1: clone or update nautilus ──────────────────────────────────
if [[ ! -d "$NAUTILUS_DIR" ]]; then
  echo "[assemble] cloning nautilus into $NAUTILUS_DIR"
  git clone "$NAUTILUS_REPO" "$NAUTILUS_DIR"
else
  echo "[assemble] reusing existing checkout at $NAUTILUS_DIR"
fi

NAUTILUS_DIR="$(cd "$NAUTILUS_DIR" && pwd)"
SHELL_APP_DIR="$NAUTILUS_DIR/src/nautilus-server/src/apps/shell"
CARGO_TOML="$NAUTILUS_DIR/src/nautilus-server/Cargo.toml"
LIB_RS="$NAUTILUS_DIR/src/nautilus-server/src/lib.rs"
MAIN_RS="$NAUTILUS_DIR/src/nautilus-server/src/main.rs"

for f in "$CARGO_TOML" "$LIB_RS" "$MAIN_RS"; do
  if [[ ! -f "$f" ]]; then
    echo "[assemble] FATAL: expected file $f not found — is this really a nautilus checkout?" >&2
    exit 1
  fi
done

# ── Step 2: copy app overlay ──────────────────────────────────────────
echo "[assemble] copying app overlay into $SHELL_APP_DIR"
mkdir -p "$SHELL_APP_DIR"
cp "$OVERLAY/mod.rs" "$SHELL_APP_DIR/mod.rs"
cp "$OVERLAY/allowed_endpoints.yaml" "$SHELL_APP_DIR/allowed_endpoints.yaml"

# ── Step 3: patch Cargo.toml — add shell feature with deps ────────────
if grep -qE '^shell = \["sui-crypto"' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: shell feature already has full deps"
elif grep -qE '^shell\s*=\s*\[\]' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: enabling sui-crypto + sui-sdk-types + seal-sdk for shell"
  awk '
    /^shell = \[\]/ {
      print "shell = [\"sui-crypto\", \"sui-sdk-types\", \"seal-sdk\"]"
      next
    }
    { print }
  ' "$CARGO_TOML" > "$CARGO_TOML.tmp"
  mv "$CARGO_TOML.tmp" "$CARGO_TOML"
elif grep -qE '^shell = ' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: shell feature present in unrecognised form — leaving alone"
else
  echo "[assemble] Cargo.toml: adding shell = [\"sui-crypto\", \"sui-sdk-types\", \"seal-sdk\"]"
  awk '
    /^\[features\]/ {
      print
      print "shell = [\"sui-crypto\", \"sui-sdk-types\", \"seal-sdk\"]"
      next
    }
    { print }
  ' "$CARGO_TOML" > "$CARGO_TOML.tmp"
  mv "$CARGO_TOML.tmp" "$CARGO_TOML"
fi

# ── Step 3b: ensure default = ["shell"] under [features] ──────────────
# Without a default the bare `cargo check`/`cargo build` picks no feature
# and `use nautilus_server::app::process_data;` (in main.rs) fails to
# resolve because the re-export in lib.rs is `#[cfg(feature = "shell")]`.
if grep -qE '^default = \["shell"\]' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: default = [\"shell\"] already set"
elif grep -qE '^default = \[' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: default features set to non-shell value — leaving alone"
else
  echo "[assemble] Cargo.toml: adding default = [\"shell\"] under [features]"
  awk '
    /^\[features\]/ && !done {
      print
      print "default = [\"shell\"]"
      done = 1
      next
    }
    { print }
  ' "$CARGO_TOML" > "$CARGO_TOML.tmp"
  mv "$CARGO_TOML.tmp" "$CARGO_TOML"
fi

# ── Step 4: overlay patched lib.rs + main.rs ──────────────────────────
# We replace these files wholesale rather than in-place patch because the
# additions (AppState shell field, ShellState construction, start_poller
# spawn) need precise positioning. The vendored versions in
# framework-patches/ track upstream nautilus@main; if upstream drifts the
# overlay still works but you should re-verify against new upstream.
echo "[assemble] overlaying patched lib.rs + main.rs"
cp "$FRAMEWORK_PATCHES/lib.rs" "$LIB_RS"
cp "$FRAMEWORK_PATCHES/main.rs" "$MAIN_RS"

echo
echo "[assemble] ✔ Nautilus checkout ready at $NAUTILUS_DIR"
echo
echo "Next:"
echo "  cd $NAUTILUS_DIR"
echo "  # AWS SSO + creds + REGION/AMI_ID env vars per docs/aws-deployment.md"
echo "  sh configure_enclave.sh shell"
