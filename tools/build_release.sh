#!/usr/bin/env bash
# Build .deb, .rpm, and .AppImage packages for Beast and Crimson into dist/.
# Usage: ./tools/build_release.sh [--deb] [--rpm] [--appimage]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "console.log(require('./package.json').version)")"
APP="beast-and-crimson"
TITLE="Beast and Crimson"
DIST="$ROOT/dist"
STAGE="$DIST/.stage"

DO_DEB=0
DO_RPM=0
DO_APPIMAGE=0
if [ $# -eq 0 ]; then
  DO_DEB=1; DO_RPM=1; DO_APPIMAGE=1
else
  for arg in "$@"; do
    case "$arg" in
      --deb) DO_DEB=1 ;;
      --rpm) DO_RPM=1 ;;
      --appimage) DO_APPIMAGE=1 ;;
      *) echo "Unknown option: $arg" >&2; exit 2 ;;
    esac
  done
fi

rm -rf "$STAGE"
mkdir -p "$DIST" "$STAGE"

stage_tree() {
  local prefix="$1"
  mkdir -p "$prefix/usr/share/$APP" \
           "$prefix/usr/bin" \
           "$prefix/usr/share/applications" \
           "$prefix/usr/share/icons/hicolor/256x256/apps"

  cp -a index.html style.css bc-start README.md "$prefix/usr/share/$APP/"
  cp -a src assets "$prefix/usr/share/$APP/"
  chmod 0755 "$prefix/usr/share/$APP/bc-start"

  cat > "$prefix/usr/bin/$APP" <<'EOF'
#!/usr/bin/env bash
exec /usr/share/beast-and-crimson/bc-start "$@"
EOF
  chmod 0755 "$prefix/usr/bin/$APP"

  cat > "$prefix/usr/share/applications/$APP.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=$TITLE
Comment=Offline dark fantasy lane battler
Exec=$APP
Icon=$APP
Terminal=false
Categories=Game;StrategyGame;
EOF

  cp assets/art/crest.png "$prefix/usr/share/icons/hicolor/256x256/apps/$APP.png"
}

if [ "$DO_DEB" -eq 1 ]; then
  if command -v dpkg-deb >/dev/null 2>&1; then
    DEB_DIR="$STAGE/deb"
    stage_tree "$DEB_DIR"
    mkdir -p "$DEB_DIR/DEBIAN"
    chmod 0755 "$DEB_DIR/DEBIAN"
    cat > "$DEB_DIR/DEBIAN/control" <<EOF
Package: $APP
Version: $VERSION
Section: games
Priority: optional
Architecture: all
Depends: python3
Maintainer: recursive-ai-dev <psychcoherence@gmail.com>
Description: Beast and Crimson — offline dark fantasy lane battler
 Command three tribes against the Collector King in a deterministic
 pixel-art lane battler with Runic Burns and an illustrated intro.
EOF
    dpkg-deb --build --root-owner-group "$DEB_DIR" "$DIST/${APP}_${VERSION}_all.deb"
    echo "[OK] Built $DIST/${APP}_${VERSION}_all.deb"
  else
    echo "[SKIP] dpkg-deb not found" >&2
  fi
fi

if [ "$DO_RPM" -eq 1 ]; then
  if command -v rpmbuild >/dev/null 2>&1; then
    RPM_TOP="$STAGE/rpmbuild"
    RPM_ROOT="$STAGE/rpm-src"
    mkdir -p "$RPM_TOP"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
    stage_tree "$RPM_ROOT"
    tar -C "$RPM_ROOT" -czf "$RPM_TOP/SOURCES/$APP-$VERSION.tar.gz" usr
    cat > "$RPM_TOP/SPECS/$APP.spec" <<EOF
Name:           $APP
Version:        $VERSION
Release:        1
Summary:        Offline dark fantasy lane battler
License:        UNLICENSED
BuildArch:      noarch
Requires:       python3
Source0:        $APP-$VERSION.tar.gz

%description
Command three tribes against the Collector King in a deterministic
pixel-art lane battler with Runic Burns and an illustrated intro.

%prep
%setup -q -c

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}
cp -a usr %{buildroot}/

%files
/usr/bin/$APP
/usr/share/$APP
/usr/share/applications/$APP.desktop
/usr/share/icons/hicolor/256x256/apps/$APP.png
EOF
    rpmbuild --define "_topdir $RPM_TOP" -bb "$RPM_TOP/SPECS/$APP.spec"
    cp "$RPM_TOP/RPMS/noarch/${APP}-${VERSION}-1.noarch.rpm" "$DIST/"
    echo "[OK] Built $DIST/${APP}-${VERSION}-1.noarch.rpm"
  else
    echo "[SKIP] rpmbuild not found" >&2
  fi
fi

if [ "$DO_APPIMAGE" -eq 1 ]; then
  APPIMAGETOOL="${APPIMAGETOOL:-$(command -v appimagetool || true)}"
  if [ -n "$APPIMAGETOOL" ]; then
    APPDIR="$STAGE/AppDir"
    stage_tree "$APPDIR"
    cp "$APPDIR/usr/share/applications/$APP.desktop" "$APPDIR/$APP.desktop"
    cp "$APPDIR/usr/share/icons/hicolor/256x256/apps/$APP.png" "$APPDIR/$APP.png"
    cat > "$APPDIR/AppRun" <<'EOF'
#!/usr/bin/env bash
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/share/beast-and-crimson/bc-start" "$@"
EOF
    chmod 0755 "$APPDIR/AppRun"
    ARCH=x86_64 "$APPIMAGETOOL" --no-appstream "$APPDIR" "$DIST/Beast_and_Crimson-${VERSION}-x86_64.AppImage"
    echo "[OK] Built $DIST/Beast_and_Crimson-${VERSION}-x86_64.AppImage"
  else
    echo "[SKIP] appimagetool not found" >&2
  fi
fi

rm -rf "$STAGE"
ls -lh "$DIST"
