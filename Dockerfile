# pd-eff — Multi-stage Dockerfile
# Stage 1: Build Next.js frontend
# Stage 2: Package everything into a single Python image

# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Stage 2: Final image ----
FROM python:3.11-slim

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir pikepdf nest-asyncio

# Backend
COPY backend/pdf_signer/ ./pdf_signer/
COPY backend/run.py ./

# Frontend (standalone build)
COPY --from=frontend /build/.next/standalone/ ./.next-standalone/
COPY --from=frontend /build/.next/static/ ./.next-standalone/.next/static/
RUN mkdir -p .next-standalone/public

# Data
RUN mkdir -p data/uploads data/signed data/certs

ENV PORT=8765
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1
ENV DATA_DIR=/app/data
ENV FRONTEND_DIR=/app/.next-standalone

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8765/api/health || exit 1

CMD ["python", "run.py"]
