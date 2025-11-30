#!/bin/bash
# Voice Agent Launcher
# Opens the voice agent in a standalone app window

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Kill any existing instance
pkill -f "python -m server.main" 2>/dev/null

# Start the server in background
source venv/bin/activate
python -m server.main &
SERVER_PID=$!

# Wait for server to start
echo "Starting Voice Agent server..."
sleep 2

# Check if server started successfully
if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "Failed to start server"
    exit 1
fi

echo "Server running (PID: $SERVER_PID)"

# Launch Chrome in app mode (standalone window)
# Try different Chrome paths for different systems
if command -v google-chrome &> /dev/null; then
    CHROME="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    CHROME="google-chrome-stable"
elif command -v chromium-browser &> /dev/null; then
    CHROME="chromium-browser"
elif command -v chromium &> /dev/null; then
    CHROME="chromium"
else
    echo "Chrome/Chromium not found. Please open http://localhost:8000 manually."
    wait $SERVER_PID
    exit 0
fi

echo "Launching Voice Agent app..."
$CHROME --app=http://localhost:8000 \
    --new-window \
    --window-size=500,700 \
    --window-position=100,100 \
    --user-data-dir=/tmp/voice-agent-chrome \
    --disable-extensions \
    --disable-plugins \
    2>/dev/null &

CHROME_PID=$!

echo "Voice Agent is running!"
echo "Press Ctrl+C to stop"

# Handle shutdown
cleanup() {
    echo -e "\nShutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $CHROME_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for Chrome to close
wait $CHROME_PID 2>/dev/null

# When Chrome closes, stop the server
kill $SERVER_PID 2>/dev/null
echo "Voice Agent stopped."
