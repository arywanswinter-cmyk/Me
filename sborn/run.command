#!/bin/bash
# run.command — double-click to play Sborn: serves this folder on port 8791 and opens it; prints the iPad LAN URL.
cd "$(dirname "$0")"
python3 -m http.server 8791 --bind 0.0.0.0 >/dev/null 2>&1 &
sleep 1
echo "Sborn: http://localhost:8791"
command -v ipconfig >/dev/null && ip=$(ipconfig getifaddr en0) && [ -n "$ip" ] && echo "iPad (same Wi-Fi): http://$ip:8791"
command -v open >/dev/null && open http://localhost:8791
wait
