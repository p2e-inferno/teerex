#!/usr/bin/env bash
#
# Bootstraps the Foundry test harness for the TeeRex Solidity contracts.
#
# The production contracts import OpenZeppelin via Remix-style GitHub URLs
# (e.g. "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.6.1/...").
# solc cannot remap a "https://"-scheme import, but it DOES resolve such an import
# as a literal path under the project root (collapsing "//" to "/"). So we vendor
# OpenZeppelin + forge-std under lib/ and expose OZ at the exact on-disk path the
# URL normalizes to via a symlink. This keeps the contract source untouched while
# letting `forge build` / `forge test` resolve the imports. All generated paths are
# gitignored; rerun this script after a fresh clone.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

OZ_TAG="v5.6.1"
OZ_DIR="lib/openzeppelin-contracts"
FS_DIR="lib/forge-std"

command -v forge >/dev/null 2>&1 || {
  echo "error: foundry not installed. Install with: curl -L https://foundry.paradigm.xyz | bash && foundryup" >&2
  exit 1
}

mkdir -p lib

if [ ! -f "$OZ_DIR/contracts/utils/ReentrancyGuard.sol" ]; then
  echo "Cloning OpenZeppelin $OZ_TAG ..."
  rm -rf "$OZ_DIR"
  git clone --quiet --depth 1 --branch "$OZ_TAG" \
    https://github.com/OpenZeppelin/openzeppelin-contracts "$OZ_DIR"
fi

if [ ! -f "$FS_DIR/src/Test.sol" ]; then
  echo "Cloning forge-std ..."
  rm -rf "$FS_DIR"
  git clone --quiet --depth 1 https://github.com/foundry-rs/forge-std "$FS_DIR"
fi

SHIM="https:/github.com/OpenZeppelin/openzeppelin-contracts/blob/$OZ_TAG"
mkdir -p "$SHIM"
ln -sfn "$ROOT/$OZ_DIR/contracts" "$SHIM/contracts"

if [ -f "$SHIM/contracts/utils/ReentrancyGuard.sol" ]; then
  echo "Foundry harness ready."
  echo "  Unit/fuzz/invariant:  forge test"
  echo "  + real Unlock (fork):  FORK_RPC_URL=https://sepolia.base.org forge test --match-contract RewardsForkTest"
else
  echo "error: URL-import shim is broken; symlink did not resolve." >&2
  exit 1
fi
