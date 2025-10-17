#!/usr/bin/env bash

wait-x-availability.sh

source export-dbus-address.sh

/usr/local/bin/prismlauncher &

PRISM_PID=$!
echo $PRISM_PID > /tmp/prism.pid
echo "PrismLauncher started with PID: $PRISM_PID"

wait $PRISM_PID

