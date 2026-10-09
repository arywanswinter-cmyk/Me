#!/bin/bash
# Double-click to play. Serves this folder on http://localhost:8790 and opens it.
cd "$(dirname "$0")"
python3 -m http.server 8790 >/dev/null 2>&1 &
sleep 1
open http://localhost:8790
wait
