#!/bin/bash
# pd-eff Desktop App Setup

echo "🔐 pd-eff Desktop Setup"
echo "========================"

# 1. Install Python dependencies
echo ""
echo "Step 1: Installing Python dependencies..."
cd ../backend
source venv/bin/activate 2>/dev/null || python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt pikepdf nest-asyncio pyinstaller
cd ..

# 2. Install Node dependencies
echo ""
echo "Step 2: Installing Node dependencies..."
cd frontend
npm install
cd ..

# 3. Build Next.js frontend
echo ""
echo "Step 3: Building frontend..."
cd frontend
npm run build
cd ..

# 4. Install Electron dependencies
echo ""
echo "Step 4: Installing Electron..."
cd desktop
npm install

# 5. Build Python executable (optional)
echo ""
echo "Step 5: Building Python executable..."
cd ../backend
pyinstaller --onefile --name pd-eff-api \
  --distpath ../desktop/dist/python \
  --workpath /tmp/pyinstaller \
  --clean \
  run.py
cd ../desktop

echo ""
echo "✅ Setup complete!"
echo ""
echo "To run the desktop app:"
echo "  cd desktop && npm start"
echo ""
echo "To build distributable:"
echo "  cd desktop && npm run build-win   # Windows"
echo "  cd desktop && npm run build-mac   # macOS"
echo "  cd desktop && npm run build-linux # Linux"
