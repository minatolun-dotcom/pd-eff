FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for PyHanko and cryptography
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir pikepdf nest-asyncio

# Copy application code
COPY pdf_signer/ pdf_signer/
COPY run.py .

# Create data directories
RUN mkdir -p data/uploads data/signed data/certs

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "run.py"]
