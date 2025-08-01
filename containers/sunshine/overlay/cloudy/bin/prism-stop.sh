#!/usr/bin/env bash

echo "Stopping Prism Launcher..."

if [ ! -f /tmp/prism.pid ]; then
    echo "No Prism Launcher PID found at /tmp/prism.pid... Not stopping."
    exit 0
fi

PRISM_PID=$(cat /tmp/prism.pid)

echo "Killing Prism Launcher with PID: $PRISM_PID"

# Kill Prism Launcher processes
kill $PRISM_PID

echo "Prism Launcher stopped"