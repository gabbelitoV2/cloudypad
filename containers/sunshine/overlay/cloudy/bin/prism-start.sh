#!/usr/bin/env bash

wait-x-availability.sh

echo "Starting Prism Launcher with args: $@"

/usr/local/bin/prismlauncher "$@" &

PRISM_PID=$!
echo $PRISM_PID > /tmp/prism.pid
echo "Prism Launcher started with PID: $PRISM_PID"

wait $PRISM_PID