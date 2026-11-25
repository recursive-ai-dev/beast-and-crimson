#!/usr/bin/env bash
# Build (unless --no-build) and push HTML5 + Linux AppImage channels to itch.io via butler.
# Usage: ./tools/push_itch.sh [user/game] [--no-build]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${ITCH_TARGET:-recursive-ai-dev/beast-and-crimson}"
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    *) TARGET="$arg" ;;
  esac
done

if ! command -v butler >/dev/null 2>&1; then
  echo "butler is not installed. See README or install from https://itch.io/docs/butler/" >&2
  exit 1
fi

if [ -z "${BUTLER_API_KEY:-}" ] && [ ! -f "${HOME}/.config/itch/butler_creds" ]; then
  echo "Not logged in to butler. Run: butler login" >&2
  exit 1
fi

VERSION="$(node -e "console.log(require('./package.json').version)")"
WEB_ZIP="$ROOT/dist/beast-and-crimson-${VERSION}-itch-web.zip"
APPIMAGE="$ROOT/dist/Beast_and_Crimson-${VERSION}-x86_64.AppImage"

if [ "$NO_BUILD" -eq 0 ]; then
  bash "$ROOT/tools/build_itch.sh"
fi

[ -f "$WEB_ZIP" ] || { echo "Missing $WEB_ZIP" >&2; exit 1; }
[ -f "$APPIMAGE" ] || { echo "Missing $APPIMAGE" >&2; exit 1; }

echo "Pushing v${VERSION} to ${TARGET}..."
butler push "$WEB_ZIP" "${TARGET}:html5" --userversion "$VERSION"
butler push "$APPIMAGE" "${TARGET}:linux" --userversion "$VERSION"
echo "[OK] Pushed html5 and linux channels to ${TARGET} (v${VERSION})"
