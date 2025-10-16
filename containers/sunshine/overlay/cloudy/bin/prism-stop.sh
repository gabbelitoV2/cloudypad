#!/usr/bin/env bash

echo "Stopping PrismLauncher..."

if [ ! -f /tmp/prism.pid ]; then
    echo "No PrismLauncher PID found at /tmp/prism.pid... Not stopping."
    exit 0
fi

PRISM_PID=$(cat /tmp/prism.pid)

echo "Killing PrismLauncher with PID: $PRISM_PID"

# Kill PrismLauncher processes
kill $PRISM_PID

echo "PrismLauncher stopped"

