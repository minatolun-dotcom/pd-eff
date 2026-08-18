"""Run the pd-eff server."""
import uvicorn
import os
import sys

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    reload = os.environ.get("RELOAD", "0") == "1"
    
    print(f"Starting pd-eff on port {port}...")
    uvicorn.run(
        "pdf_signer.main:app",
        host="0.0.0.0",
        port=port,
        reload=reload,
    )
