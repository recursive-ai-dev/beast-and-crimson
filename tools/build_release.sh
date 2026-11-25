#!/usr/bin/env bash
# Build Electron-wrapped .deb, .rpm, and .AppImage packages for Beast and Crimson into dist/.
# Usage: ./tools/build_release.sh [--deb] [--rpm] [--appimage]
set -euo pipefail
umask 022

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Ensure packaged directories and assets are world-readable (0755/0644) even if
# the builder's shell had a restrictive umask (e.g. 0077), so installed .deb/.rpm
# builds run as a normal desktop user with full PipeWire/PulseAudio access.
chmod -R u+rwX,go+rX index.html style.css manifest.webmanifest sw.js LICENSE package.json src assets electron flatpak

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
chmod a+r "$ROOT"/dist/*.deb "$ROOT"/dist/*.rpm "$ROOT"/dist/*.AppImage 2>/dev/null || true
