#!/usr/bin/env bash
# Build itch.io HTML5 web zip and Linux AppImage into dist/.
# Usage: ./tools/build_itch.sh
set -euo pipefail
umask 022

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

chmod -R u+rwX,go+rX index.html style.css manifest.webmanifest sw.js LICENSE package.json src assets electron flatpak

VERSION="$(node -e "console.log(require('./package.json').version)")"
WEB_ZIP="$ROOT/dist/beast-and-crimson-${VERSION}-itch-web.zip"

mkdir -p "$ROOT/dist"

python3 - "$ROOT" "$WEB_ZIP" <<'PY'
import os, sys, zipfile
root, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in ("index.html", "style.css", "manifest.webmanifest", "sw.js", "LICENSE"):
        p = os.path.join(root, f)
        if os.path.exists(p):
            z.write(p, f)
    for d in ("src", "assets"):
        for dirpath, _, filenames in os.walk(os.path.join(root, d)):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                z.write(full, os.path.relpath(full, root))
print(f"[OK] Built {out}")
PY

if [ "${1:-}" != "--web-only" ]; then
  bash "$ROOT/tools/build_release.sh" --appimage
fi
