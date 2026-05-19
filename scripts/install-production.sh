#!/bin/bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# CloudWatch Viewer — Production Installation Script (macOS launchd)
# ─────────────────────────────────────────────────────────────────────────────
# Installs the app as a persistent background service using launchd.
#
# Usage:
#   ./scripts/install-production.sh <install-directory> <plist-name> <port>
#
# What it does:
#   1. Builds the project
#   2. Copies compiled files to the specified install directory
#   3. Creates a launchd plist at ~/Library/LaunchAgents/<plist-name>
#   4. Loads and starts the service
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="${1:-}"
PLIST_NAME="${2:-}"
PORT="${3:-3128}"
PLIST_FILE="$HOME/Library/LaunchAgents/$PLIST_NAME"
LOG_DIR="$INSTALL_DIR/logs"

# ── Validate arguments ──────────────────────────────────────────────────────
if [ -z "$INSTALL_DIR" ] || [ -z "$PLIST_NAME" ]; then
  echo "Usage: $0 <install-directory> <plist-name> <port>"
  echo ""
  echo "Example:"
  echo "  $0 \$HOME/global/cloudwatch-viewer-installations/production com.cloudwatch-viewer.plist 3128"
  exit 1
fi

# Resolve to absolute path
case "$INSTALL_DIR" in
  /*) ;;
  *) INSTALL_DIR="$(pwd)/$INSTALL_DIR" ;;
esac

# Derive service label from plist name (strip .plist extension)
SERVICE_LABEL="${PLIST_NAME%.plist}"

# ── Helpers ──────────────────────────────────────────────────────────────────
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
ok()    { echo -e "\033[1;32m[OK]\033[0m    $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    error "$1 is required but not installed."
    exit 1
  fi
}

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "Checking prerequisites..."
check_cmd node
check_cmd npm

NODE_VERSION=$(node -v | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js 18+ is required (found v$NODE_VERSION)"
  exit 1
fi
ok "Node.js v$NODE_VERSION"

# ── Step 1: Build ────────────────────────────────────────────────────────────
info "Installing dependencies..."
cd "$PROJECT_DIR"
npm install --production=false

info "Building project..."
npm run build
ok "Build complete"

# ── Step 2: Prepare installation directory ───────────────────────────────────
info "Preparing installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# ── Step 3: Copy files ──────────────────────────────────────────────────────
info "Copying files to installation directory..."

# Copy compiled output
rsync -a --delete "$PROJECT_DIR/dist/" "$INSTALL_DIR/dist/"

# Copy client (frontend)
rsync -a --delete "$PROJECT_DIR/client/" "$INSTALL_DIR/client/"

# Copy node_modules (production only)
rsync -a --delete "$PROJECT_DIR/node_modules/" "$INSTALL_DIR/node_modules/"

# Copy package.json
cp "$PROJECT_DIR/package.json" "$INSTALL_DIR/package.json"

# Copy config.ts (production configuration)
if [ -f "$PROJECT_DIR/config.ts" ]; then
  cp "$PROJECT_DIR/config.ts" "$INSTALL_DIR/config.ts"
  ok "config.ts copied"
else
  warn "config.ts not found in project root — ensure it exists before starting the service"
fi

# Copy config.local.ts if it exists
if [ -f "$PROJECT_DIR/config.local.ts" ]; then
  cp "$PROJECT_DIR/config.local.ts" "$INSTALL_DIR/config.local.ts"
  ok "config.local.ts copied"
fi

ok "Files copied"

# ── Step 4: Generate launchd plist ──────────────────────────────────────────
NODE_BIN=$(which node)

info "Generating launchd plist at $PLIST_FILE"

cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$SERVICE_LABEL</string>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>dist/src/server.js</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PORT</key>
        <string>$PORT</string>
    </dict>
    <key>KeepAlive</key>
    <true/>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/stdout.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/stderr.log</string>
</dict>
</plist>
EOF

ok "Plist created"

# ── Step 5: Load the service ────────────────────────────────────────────────
info "Loading launchd service..."

# Always attempt to unload by label first (safe if not loaded)
launchctl bootout "gui/$(id -u)/$SERVICE_LABEL" 2>/dev/null || true

# Unload existing service if still present
if launchctl list | grep -q "$SERVICE_LABEL"; then
  warn "Service already loaded — unloading first..."
  launchctl bootout "gui/$(id -u)/$SERVICE_LABEL" 2>/dev/null || true
  sleep 2
fi

# Kill any stale process still holding the port
if lsof -ti:"$PORT" &>/dev/null; then
  warn "Port $PORT is still in use — killing stale process..."
  lsof -ti:"$PORT" | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# Ensure service is fully unloaded before bootstrapping
for i in {1..10}; do
  if ! launchctl list | grep -q "$SERVICE_LABEL"; then
    break
  fi
  sleep 0.5
done

# Bootstrap with one automatic retry in case launchd is still settling
BOOTSTRAP_ERR=""
if ! BOOTSTRAP_ERR=$(launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE" 2>&1); then
  warn "First bootstrap attempt failed, retrying once..."
  launchctl bootout "gui/$(id -u)/$SERVICE_LABEL" 2>/dev/null || true
  sleep 1
  if ! BOOTSTRAP_ERR=$(launchctl bootstrap "gui/$(id -u)" "$PLIST_FILE" 2>&1); then
    error "Failed to bootstrap service. launchctl output:"
    error "  $BOOTSTRAP_ERR"
    error "Try: launchctl bootout gui/$(id -u)/$SERVICE_LABEL"
    exit 5
  fi
fi
ok "Service loaded"

# ── Step 6: Verify ──────────────────────────────────────────────────────────
info "Verifying service..."

# Wait for server to become responsive on the port
for attempt in {1..30}; do
  if curl -s http://localhost:$PORT &>/dev/null; then
    ok "Service is running at http://localhost:$PORT"
    break
  fi
  if [ $attempt -eq 30 ]; then
    error "Service failed to start. Check logs at:"
    error "  $LOG_DIR/stdout.log"
    error "  $LOG_DIR/stderr.log"
    error "Process status: $(launchctl list | grep $SERVICE_LABEL || echo 'Not in launchctl list')"
    exit 1
  fi
  sleep 1
done

info "CloudWatch Viewer is running at http://localhost:$PORT"
ok "Installation complete"

echo ""
echo "Manage the service:"
echo "  Status:   launchctl list | grep $SERVICE_LABEL"
echo "  Logs:     tail -f $LOG_DIR/stdout.log"
echo "  Stop:     launchctl unload $PLIST_FILE"
echo "  Restart:  launchctl unload $PLIST_FILE && launchctl load $PLIST_FILE"
echo "  Uninstall: launchctl unload $PLIST_FILE && rm $PLIST_FILE && rm -rf $INSTALL_DIR"
