#!/bin/bash
# granola-export setup — installs a daily launchd job to export Granola meeting notes
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EXPORT_SCRIPT="$SCRIPT_DIR/export.ts"
PLIST_LABEL="com.granola-export.daily"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_LABEL.plist"

# Find bun
BUN_PATH="$(which bun 2>/dev/null || echo "$HOME/.bun/bin/bun")"
if [ ! -x "$BUN_PATH" ]; then
  echo "Error: bun not found. Install it: curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# Verify Granola is installed
GRANOLA_DIR="$HOME/Library/Application Support/Granola"
if [ ! -d "$GRANOLA_DIR" ]; then
  echo "Error: Granola not found at $GRANOLA_DIR"
  echo "Install Granola and log in first: https://granola.ai"
  exit 1
fi

# Create output directory
mkdir -p "$SCRIPT_DIR/notes"

# Run initial export
echo "Running initial export..."
"$BUN_PATH" run "$EXPORT_SCRIPT" || {
  echo "Warning: initial export had errors (see above)"
}

# Install launchd job
echo ""
echo "Installing daily export job..."

# Unload existing if present
launchctl unload "$PLIST_PATH" 2>/dev/null || true

cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$BUN_PATH</string>
        <string>run</string>
        <string>$EXPORT_SCRIPT</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>22</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/granola-export.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/granola-export.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST

launchctl load "$PLIST_PATH"
echo "Installed: $PLIST_PATH"
echo "Export runs daily at 10pm. Check /tmp/granola-export.log for output."
echo ""
echo "Done! Notes exported to: $SCRIPT_DIR/notes/"
