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

for f in "$CARGO_TOML" "$LIB_RS"; do
  if [[ ! -f "$f" ]]; then
    echo "[assemble] FATAL: expected file $f not found — is this really a nautilus checkout?" >&2
    exit 1
  fi
done

# ── Step 2: copy overlay ──────────────────────────────────────────────
echo "[assemble] copying overlay into $SHELL_APP_DIR"
mkdir -p "$SHELL_APP_DIR"
cp "$OVERLAY/mod.rs" "$SHELL_APP_DIR/mod.rs"
cp "$OVERLAY/allowed_endpoints.yaml" "$SHELL_APP_DIR/allowed_endpoints.yaml"

# ── Step 3: patch Cargo.toml — add `shell = []` feature ───────────────
if grep -qE '^shell\s*=\s*\[\]' "$CARGO_TOML"; then
  echo "[assemble] Cargo.toml: shell feature already present"
else
  echo "[assemble] patching Cargo.toml: adding shell = []"
  awk '
    /^\[features\]/ {
      print
      print "shell = []"
      next
    }
    { print }
  ' "$CARGO_TOML" > "$CARGO_TOML.tmp"
  mv "$CARGO_TOML.tmp" "$CARGO_TOML"
fi

# ── Step 4: patch lib.rs — add cfg blocks ─────────────────────────────
if grep -q 'feature = "shell"' "$LIB_RS"; then
  echo "[assemble] lib.rs: shell cfg blocks already present"
else
  echo "[assemble] patching lib.rs"
  awk '
    /^mod apps \{/ {
      print
      print "    #[cfg(feature = \"shell\")]"
      print "    #[path = \"shell/mod.rs\"]"
      print "    pub mod shell;"
      print ""
      next
    }
    /^pub mod app \{/ {
      print
      print "    #[cfg(feature = \"shell\")]"
      print "    pub use crate::apps::shell::*;"
      print ""
      next
    }
    { print }
  ' "$LIB_RS" > "$LIB_RS.tmp"
  mv "$LIB_RS.tmp" "$LIB_RS"
fi

echo
echo "[assemble] ✔ Nautilus checkout ready at $NAUTILUS_DIR"
echo
echo "Next:"
echo "  cd $NAUTILUS_DIR"
echo "  # AWS SSO + creds + REGION/AMI_ID env vars per docs/aws-deployment.md"
echo "  sh configure_enclave.sh shell"
