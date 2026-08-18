"""Run the PDF Signer & Verifier server."""
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "pdf_signer.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
