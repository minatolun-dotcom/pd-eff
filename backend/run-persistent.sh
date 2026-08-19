#!/bin/bash
# Persistent backend server with auto-restart
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

while true; do
    echo "[$(date)] Starting backend..."
    ./venv/bin/uvicorn pdf_signer.main:app --host 0.0.0.0 --port 8000 2>&1
    echo "[$(date)] Backend stopped, restarting in 2s..."
    sleep 2
done
