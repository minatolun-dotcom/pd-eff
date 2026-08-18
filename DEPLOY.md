# Deploy pd-eff to Render.com

## Prerequisites

1. A GitHub account
2. A Render.com account (free tier works)
3. Your code pushed to a GitHub repository

## Step 1: Push to GitHub

```bash
cd pdf-signer-app
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/minatolun-dotcom/pdf-eff.git
git push -u origin main
```

## Step 2: Deploy Backend (FastAPI)

1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure:
   - **Name:** `pd-eff-api`
   - **Runtime:** Python
   - **Build Command:**
     ```
     cd backend && pip install -r requirements.txt && pip install pikepdf nest-asyncio
     ```
   - **Start Command:**
     ```
     cd backend && python run.py
     ```
   - **Free Plan:** Yes ✅
5. Click **"Create Web Service"**
6. Wait for deployment (2-3 minutes)
7. Note your backend URL: `https://pdf-signer-api.onrender.com`

## Step 3: Deploy Frontend (Next.js)

1. Click **"New +"** → **"Static Site"**
2. Connect the same GitHub repository
3. Configure:
   - **Name:** `pd-eff-frontend`
   - **Build Command:**
     ```
     cd frontend && npm install && npm run build
     ```
   - **Publish Directory:**
     ```
     frontend/.next
     ```
   - **Environment Variables:**
     ```
     NEXT_PUBLIC_API_URL = https://pd-eff-api.onrender.com
     ```
4. Click **"Create Static Site"**
5. Wait for deployment (2-3 minutes)
6. Your app is live at: `https://pd-eff-frontend.onrender.com`

## Step 4: Update CORS (First Deploy Only)

After the first deploy, update the backend's CORS settings with your actual frontend URL:

1. Edit `backend/pdf_signer/main.py`
2. Replace `pd-eff-frontend.onrender.com` with your actual frontend URL
3. Push the change:
   ```bash
   git add . && git commit -m "Update CORS" && git push
   ```
4. Render will auto-redeploy

## Environment Variables

### Backend
| Variable | Value | Description |
|----------|-------|-------------|
| `PYTHON_VERSION` | `3.12.0` | Python version |

### Frontend
| Variable | Value | Description |
|----------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://pdf-signer-api.onrender.com` | Backend API URL |

## Free Tier Limitations

Render free tier has:
- **750 hours/month** per service
- **Spins down after 15 min** of inactivity (first request takes ~30s)
- **512 MB RAM** per service
- **Shared CPU**

For production, consider the paid plan ($7/month per service).

## Alternative: Docker Deployment

If you prefer Docker:

```bash
# Backend
cd backend
docker build -t pdf-signer-api .
docker run -p 8000:8000 pdf-signer-api

# Frontend
cd frontend
docker build -t pdf-signer-frontend .
docker run -p 3000:3000 pdf-signer-frontend
```

## Troubleshooting

### "Build failed" on Render
- Check build logs for missing dependencies
- Make sure `requirements.txt` includes all packages

### "Application failed to respond"
- Check if the start command is correct
- Look at service logs in Render dashboard

### CORS errors
- Make sure `NEXT_PUBLIC_API_URL` is set correctly
- Update `allow_origins` in backend CORS settings

### PDF signing fails in production
- Ensure `pikepdf` is installed (added to build command)
- Check that file write permissions work (Render has ephemeral storage)
