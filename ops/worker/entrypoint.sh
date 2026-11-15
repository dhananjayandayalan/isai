#!/bin/sh
# Start the worker: fetch any missing model (each one checked by SHA-256), then process
# the queue. Arguments go to `isai worker` (for example --once).
set -eu
isai models fetch
exec isai worker "$@"
