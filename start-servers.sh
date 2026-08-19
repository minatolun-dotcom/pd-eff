#!/bin/bash
# Start pd-eff servers persistently
# Usage: ./start-servers.sh

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "Starting pd-eff servers..."

# Kill any existing instances
pkill -f "uvicorn pdf_signer.main" 2>/dev/null
pkill -f "next dev --port 3000" 2>/dev/null
sleep 2

# Start backend
cd backend
setsid ./venv/bin/uvicorn pdf_signer.main:app --host 0.0.0.0 --port 8000 > /tmp/pd-eff-backend.log 2>&1 &
echo "Backend PID: $!"
cd ..

# Start frontend
cd frontend
setsid npx next dev --port 3000 > /tmp/pd-eff-frontend.log 2>&1 &
echo "Frontend PID: $!"
cd ..

# Wait and verify
sleep 8
echo ""
echo "=== Status ==="
echo "Backend:  $(curl -s http://localhost:8000/api/health 2>/dev/null || echo 'FAILED')"
echo "Frontend: http://localhost:3000 → $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000 2>/dev/null || echo 'FAILED')"
echo ""
echo "Both servers started. Logs: /tmp/pd-eff-backend.log, /tmp/pd-eff-frontend.log"
