#!/bin/bash

# Install Service Monitor as a system service
# This ensures the monitor starts automatically and stays running

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_FILE="com.settlepaisa.servicemonitor.plist"
LAUNCHD_PATH="$HOME/Library/LaunchAgents/$SERVICE_FILE"

echo "🔧 Installing SettlePaisa Service Monitor..."

# Create LaunchAgent plist file
cat > "$LAUNCHD_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.settlepaisa.servicemonitor</string>
    
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$PROJECT_DIR/scripts/service-monitor.sh</string>
    </array>
    
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    
    <key>StandardOutPath</key>
    <string>/tmp/service-monitor-stdout.log</string>
    
    <key>StandardErrorPath</key>
    <string>/tmp/service-monitor-stderr.log</string>
    
    <key>RunAtLoad</key>
    <true/>
    
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>
    
    <key>ProcessType</key>
    <string>Background</string>
    
    <key>ThrottleInterval</key>
    <integer>10</integer>
    
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF

echo "✅ Created LaunchAgent at $LAUNCHD_PATH"

# Load the service
launchctl unload "$LAUNCHD_PATH" 2>/dev/null  # Unload if already loaded
launchctl load "$LAUNCHD_PATH"

if [ $? -eq 0 ]; then
    echo "✅ Service Monitor installed and started successfully"
    echo "📊 Monitor status: $(launchctl list | grep com.settlepaisa.servicemonitor)"
    echo ""
    echo "📋 Service Management Commands:"
    echo "  Start:   launchctl start com.settlepaisa.servicemonitor"
    echo "  Stop:    launchctl stop com.settlepaisa.servicemonitor"
    echo "  Status:  launchctl list | grep servicemonitor"
    echo "  Logs:    tail -f /tmp/service-monitor.log"
    echo ""
    echo "🔄 The service will auto-start on system boot"
else
    echo "❌ Failed to install service monitor"
    exit 1
fi