#!/usr/bin/env python3
"""Test trust store with government PDF."""
import requests, json

BASE = "http://localhost:8000"
pdf_path = "/home/khuptong/project/pd-eff/st tribe.pdf"

# 1. Verify without trust store
print("=== 1. Verify WITHOUT trust store ===")
with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/verify", files={"file": ("st_tribe.pdf", f, "application/pdf")})
result = r.json()
print(f"  Overall: {result['overall_status']}")
print(f"  Signatures: {result['signature_count']}")
for sig in result.get("signatures", []):
    print(f"  - {sig['field_name']}: intact={sig['intact']}, trust={sig['trust_status']}")
    if sig.get("signer"):
        print(f"    signer: {sig['signer'].get('common_name', '?')}")
    if sig.get("certificates"):
        print(f"    chain: {len(sig['certificates'])} certs")
        for c in sig["certificates"]:
            print(f"      {c.get('subject_cn', '?')} <- {c.get('issuer_cn', '?')}")

# 2. Extract certificates
print("\n=== 2. Extract certs from PDF ===")
with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/trust-store/extract",
                      files={"file": ("st_tribe.pdf", f, "application/pdf")},
                      data={"certificate_index": "0", "name": "CCA India 2014 Root", "purpose": "root"})
print(f"  Status: {r.status_code}")
if r.status_code == 200:
    data = r.json()
    print(f"  Added: {data.get('name')}")
    print(f"  Total certs found: {data.get('total_certs')}")
    for c in data.get("all_certs", []):
        print(f"    [{c['index']}] {c['cn']} <- {c['issuer']}")
else:
    print(f"  Error: {r.json()}")

# 3. Add the root cert
print("\n=== 3. Add root cert to trust store ===")
with open("/tmp/cert_0.pem") as f:
    pem = f.read()
r = requests.post(f"{BASE}/api/trust-store", data={
    "name": "CCA India 2014 (Root CA)",
    "pem_data": pem,
    "purpose": "root",
})
print(f"  Status: {r.status_code}: {r.json().get('message', r.json())}")

# 4. List trust store
print("\n=== 4. Trust store contents ===")
r = requests.get(f"{BASE}/api/trust-store")
for cert in r.json():
    print(f"  - {cert['name']} ({cert['issuer_cn']})")

# 5. Re-verify
print("\n=== 5. Re-verify with trust store ===")
with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/verify", files={"file": ("st_tribe.pdf", f, "application/pdf")})
result = r.json()
print(f"  Overall: {result['overall_status']}")
for sig in result.get("signatures", []):
    print(f"  - {sig['field_name']}: intact={sig['intact']}, trust={sig['trust_status']}")
    if sig.get("signer"):
        print(f"    signer: {sig['signer'].get('common_name', '?')}")
