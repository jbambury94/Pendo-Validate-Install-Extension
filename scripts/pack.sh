#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_DIR="$ROOT_DIR/extension"
OUT_ZIP="$ROOT_DIR/pendo-validate-install-lite.zip"

rm -f "$OUT_ZIP"
cd "$EXT_DIR"
zip -r "$OUT_ZIP" .
echo "Created: $OUT_ZIP"
