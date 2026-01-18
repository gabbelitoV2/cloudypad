#!/usr/bin/env bash

# 
# Start Prism Launcher (Minecraft)
#

wait-x-availability.sh

source export-dbus-address.sh

echo "Starting Prism Launcher with args: $@"

prismlauncher "$@" &

PRISM_PID=$!
echo $PRISM_PID > /tmp/prismlauncher.pid
echo "Prism Launcher started with PID: $PRISM_PID"

wait $PRISM_PID
