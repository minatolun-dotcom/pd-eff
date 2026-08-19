import os, uvicorn

port = int(os.environ.get("PORT", 8765))
print(f"Starting pd-eff on port {port}...")
uvicorn.run("pdf_signer.main:app", host="0.0.0.0", port=port)
