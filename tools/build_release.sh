#!/usr/bin/env bash
# Build Electron-wrapped .deb, .rpm, and .AppImage packages for Beast and Crimson into dist/.
# Usage: ./tools/build_release.sh [--deb] [--rpm] [--appimage]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGETS=()
if [ $# -eq 0 ]; then
  TARGETS=(deb rpm AppImage)
else
  for arg in "$@"; do
    case "$arg" in
      --deb) TARGETS+=(deb) ;;
      --rpm) TARGETS+=(rpm) ;;
      --appimage) TARGETS+=(AppImage) ;;
      *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
  done
fi

npx --no-install electron-builder --linux "${TARGETS[@]}" --publish never
