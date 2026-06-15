#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="DevLaunch"
VERSION="1.0.0"
OUT_DIR="$ROOT/dist"

echo "==> Cleaning..."
rm -rf "$ROOT/dist-linux"
mkdir -p "$OUT_DIR"

BUILD="$ROOT/dist-linux"
PKG="$BUILD/opt/$APP_NAME"
mkdir -p "$PKG"

echo "==> Copying app source..."
cp -r "$ROOT/src" "$PKG/"
cp -r "$ROOT/assets" "$PKG/"
cp "$ROOT/package.json" "$PKG/"
cp "$ROOT/.env" "$PKG/"

echo "==> Copying node_modules (production only)..."
mkdir -p "$PKG/node_modules"
# Use npm ls to get production dependency paths
cd "$ROOT"
npm ls --prod --all --parseable 2>/dev/null | tail -n +2 | sort -u | while read p; do
  if [ -n "$p" ] && [ -d "$p" ]; then
    rel="${p#$ROOT/node_modules/}"
    [ "$rel" = "$p" ] && continue
    mkdir -p "$PKG/node_modules/$(dirname "$rel")"
    cp -r "$p" "$PKG/node_modules/$rel" 2>/dev/null || true
  fi
done

echo "==> Copying Electron binary..."
mkdir -p "$PKG/electron-dist"
cp -r "$ROOT/node_modules/electron/dist/." "$PKG/electron-dist/"
# Create launcher script instead of symlink
cat > "$PKG/$APP_NAME" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/electron-dist/electron" "$DIR" "$@"
LAUNCHER
chmod +x "$PKG/$APP_NAME"

echo "==> Creating launcher wrapper..."
mkdir -p "$BUILD/usr/local/bin"
cat > "$BUILD/usr/local/bin/devlaunch" << 'WRAPPER'
#!/bin/bash
exec /opt/DevLaunch/DevLaunch "$@"
WRAPPER
chmod +x "$BUILD/usr/local/bin/devlaunch"

echo "==> Creating desktop entry..."
mkdir -p "$BUILD/usr/share/applications"
cat > "$BUILD/usr/share/applications/devlaunch.desktop" << DESKTOP
[Desktop Entry]
Name=DevLaunch
Comment=Project launcher and terminal manager for developers
Exec=/opt/DevLaunch/DevLaunch %F
Icon=devlaunch
Terminal=false
Type=Application
Categories=Development;
StartupNotify=true
DESKTOP

echo "==> Installing icon..."
mkdir -p "$BUILD/usr/share/icons/hicolor/256x256/apps"
cp "$ROOT/assets/icon.png" "$BUILD/usr/share/icons/hicolor/256x256/apps/devlaunch.png"

echo "==> Creating DEBIAN/control and postinst..."
mkdir -p "$BUILD/DEBIAN"
cat > "$BUILD/DEBIAN/postinst" << 'POSTINST'
#!/bin/bash
set -e
SANDBOX="/opt/DevLaunch/electron-dist/chrome-sandbox"
if [ -f "$SANDBOX" ]; then
  chown root:root "$SANDBOX" 2>/dev/null || true
  chmod 4755 "$SANDBOX" 2>/dev/null || true
fi
exit 0
POSTINST
chmod 755 "$BUILD/DEBIAN/postinst"
cat > "$BUILD/DEBIAN/control" << CONTROL
Package: devlaunch
Version: $VERSION
Section: development
Priority: optional
Architecture: amd64
Maintainer: DevLaunch <dev@devlaunch.app>
Homepage: https://devlaunch.app
Description: Project launcher and terminal manager for developers
Depends: libgtk-3-0, libnotify4, libnss3, libxss1, libxtst6, xdg-utils, libatspi2.0-0, libuuid1, libsecret-1-0
CONTROL

echo "==> Building .deb..."
fakeroot dpkg-deb --build "$BUILD" "$OUT_DIR/devlaunch_${VERSION}_amd64.deb"

echo "==> Done: $OUT_DIR/devlaunch_${VERSION}_amd64.deb"
ls -lh "$OUT_DIR/devlaunch_${VERSION}_amd64.deb"
