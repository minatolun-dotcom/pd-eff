#!/bin/bash
# pd-eff — Start both backend and frontend

echo "🔐 pd-eff"
echo "========================"

# Start backend
echo ""
echo "Starting backend on http://localhost:8000..."
cd backend

# Create venv with Python 3.12 if not exists
if [ ! -d "venv" ]; then
    echo "Setting up Python environment..."
    ~/.local/bin/uv venv --python 3.12 venv
    source venv/bin/activate
    ~/.local/bin/uv pip install -r requirements.txt
else
    source venv/bin/activate
fi

python run.py &
BACKEND_PID=$!
cd ..

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on http://localhost:3000..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both services started!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both services"

# Cleanup on exit
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT INT TERM

wait $BACKEND_PID $FRONTEND_PID
