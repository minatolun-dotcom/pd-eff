#!/usr/bin/env python3
"""Comprehensive backend API test suite for pd-eff."""
import requests, json, os, time

BASE = "http://localhost:8000"
passed = 0; failed = 0; bugs = []

def test(name, fn):
    global passed, failed
    try:
        result = fn()
        if result is False:
            failed += 1; bugs.append(name); print(f"  FAIL: {name}")
        else:
            passed += 1; print(f"  PASS: {name}")
    except Exception as e:
        failed += 1; bugs.append(f"{name}: {e}"); print(f"  FAIL: {name}: {e}")

print("=" * 60)
print("  COMPREHENSIVE BACKEND API TESTS")
print("=" * 60)

# 1. Health
print("\n[1] Health")
test("GET /api/health", lambda: requests.get(f"{BASE}/api/health").json()["status"] == "ok")

# 2. Certificates
print("\n[2] Certificates")
r = requests.post(f"{BASE}/api/certificates/generate", data={"common_name": "Test User", "organization": "Test Org"})
cert = r.json()
test("Generate cert (200)", lambda: r.status_code == 200)
test("Returns id", lambda: "id" in cert)
test("Returns passphrase", lambda: cert.get("passphrase") == "password")
cert_id = cert.get("id", "")

r = requests.get(f"{BASE}/api/certificates")
test("List certs (200)", lambda: r.status_code == 200)
test("Returns list", lambda: isinstance(r.json(), list))

r2 = requests.post(f"{BASE}/api/certificates/generate", data={"common_name": "Alice", "organization": "Corp"})
cert2 = r2.json()
cert2_id = cert2.get("id", "")
test("Generate 2nd cert", lambda: r2.status_code == 200)

test("Upload invalid file rejected", lambda: requests.post(
    f"{BASE}/api/certificates", files={"file": ("t.txt", b"x", "text/plain")}, data={"name": "Bad"}
).status_code == 400)

r = requests.delete(f"{BASE}/api/certificates/{cert2_id}")
test("Delete cert (200)", lambda: r.status_code == 200)
test("Delete nonexistent (404)", lambda: requests.delete(f"{BASE}/api/certificates/nope").status_code == 404)

# 3. PDF Signing
print("\n[3] PDF Signing")
pdf_path = "/tmp/test_doc.pdf"
import pikepdf
pdf = pikepdf.new()
pdf.add_blank_page(page_size=(612, 792))
pdf.save(pdf_path)
test("PDF created", lambda: os.path.exists(pdf_path))

with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign", files={"file": ("test.pdf", f, "application/pdf")},
                      data={"certificate_id": cert_id, "passphrase": "password", "signer_name": "Test"})
sr = r.json()
test("Sign (200)", lambda: r.status_code == 200)
test("Returns signed_filename", lambda: "signed_filename" in sr)
test("Returns download_url", lambda: "download_url" in sr)
rid = sr.get("id", "")

with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign", files={"file": ("test.pdf", f, "application/pdf")},
                      data={"certificate_id": cert_id, "passphrase": "wrong"})
test("Wrong passphrase (500)", lambda: r.status_code == 500)

with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign", files={"file": ("test.pdf", f, "application/pdf")},
                      data={"certificate_id": "nope", "passphrase": "password"})
test("Non-existent cert (404)", lambda: r.status_code == 404)

r = requests.post(f"{BASE}/api/sign", files={"file": ("t.txt", b"hi", "text/plain")},
                  data={"certificate_id": cert_id, "passphrase": "password"})
test("Non-PDF rejected (400)", lambda: r.status_code == 400)

if rid:
    r = requests.get(f"{BASE}/api/download/{rid}")
    test("Download signed (200)", lambda: r.status_code == 200)
    test("Returns PDF", lambda: r.content[:5] == b"%PDF-")

test("Download nonexistent (404)", lambda: requests.get(f"{BASE}/api/download/fake").status_code == 404)

# 4. Verification
print("\n[4] Verification")
signed_path = "/tmp/signed_test.pdf"
if rid:
    r = requests.get(f"{BASE}/api/download/{rid}")
    with open(signed_path, "wb") as f: f.write(r.content)

with open(signed_path, "rb") as f:
    r = requests.post(f"{BASE}/api/verify", files={"file": ("s.pdf", f, "application/pdf")})
vr = r.json()
test("Verify (200)", lambda: r.status_code == 200)
test("Has is_valid", lambda: "is_valid" in vr)
test("Finds 1 sig", lambda: vr.get("signature_count") == 1)
test("Signature is intact (not tampered)", lambda: vr['signatures'][0].get('intact') is True if vr.get('signature_count', 0) > 0 else True)

with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/verify", files={"file": ("u.pdf", f, "application/pdf")})
test("Verify unsigned (0 sigs)", lambda: r.json().get("signature_count") == 0)

# 5. Multiple Signatures
print("\n[5] Multiple Signatures")
with open(signed_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign/advanced",
                      files={"file": ("s.pdf", f, "application/pdf")},
                      data={"certificate_id": cert_id, "passphrase": "password",
                            "signer_name": "Second", "position": "bottom_left"})
mr = r.json()
test("Multi-sign (200)", lambda: r.status_code == 200)
test("Has total_signatures", lambda: "total_signatures" in mr)

mid = mr.get("id", "")
if mid:
    r = requests.get(f"{BASE}/api/download/{mid}")
    with open("/tmp/multi.pdf", "wb") as f: f.write(r.content)
with open("/tmp/multi.pdf", "rb") as f:
    r = requests.post(f"{BASE}/api/verify", files={"file": ("m.pdf", f, "application/pdf")})
test("Multi: 2 sigs", lambda: r.json().get("signature_count") == 2)
test("Multi: sigs intact", lambda: all(s.get('intact') for s in r.json().get('signatures', [])) if r.json().get('signature_count', 0) > 0 else True)

# 6. Advanced Signing
print("\n[6] Advanced Signing")
with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign/advanced",
                      files={"file": ("t.pdf", f, "application/pdf")},
                      data={"certificate_id": cert_id, "passphrase": "password",
                            "signer_name": "Custom", "visible": "true",
                            "custom_x1": 100, "custom_y1": 100,
                            "custom_x2": 300, "custom_y2": 160,
                            "stamp_text": "CUSTOM"})
test("Custom box sign (200)", lambda: r.status_code == 200)
test("Has signature_box", lambda: "signature_box" in r.json())

with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/sign/advanced",
                      files={"file": ("t.pdf", f, "application/pdf")},
                      data={"certificate_id": cert_id, "passphrase": "password",
                            "signer_name": "Pos", "position": "top_left"})
test("Position preset (200)", lambda: r.status_code == 200)

# 7. Positions & Timestamps
print("\n[7] Positions & Timestamps")
r = requests.get(f"{BASE}/api/signature/positions")
test("Positions (200)", lambda: r.status_code == 200)
test("5 presets", lambda: len(r.json().get("positions", {})) == 5)

r = requests.get(f"{BASE}/api/timestamp/servers")
test("Timestamp servers (200)", lambda: r.status_code == 200)
test(">=5 servers", lambda: len(r.json().get("servers", [])) >= 5)

# 8. PDF Info
print("\n[8] PDF Info")
r = requests.get(f"{BASE}/api/pdf/info", params={"pdf_path": pdf_path})
test("PDF info (200)", lambda: r.status_code == 200)
test("page_count >= 1", lambda: r.json().get("page_count", 0) >= 1)
test("Has signature_count", lambda: "signature_count" in r.json())
test("Non-existent (404)", lambda: requests.get(f"{BASE}/api/pdf/info", params={"pdf_path": "/tmp/nope.pdf"}).status_code == 404)

# 9. Encryption
print("\n[9] Encryption")
with open(pdf_path, "rb") as f:
    r = requests.post(f"{BASE}/api/pdf/encrypt",
                      files={"file": ("t.pdf", f, "application/pdf")},
                      data={"user_password": "secret", "owner_password": "admin"})
er = r.json()
test("Encrypt (200)", lambda: r.status_code == 200)
test("encrypted=True", lambda: er.get("encrypted") is True)
test("AES-256", lambda: er.get("algorithm") == "AES-256")

# 10. Audit Records
print("\n[10] Audit Records")
test("Signing records (200)", lambda: requests.get(f"{BASE}/api/signing-records").status_code == 200)
test("Signing records is list", lambda: isinstance(requests.get(f"{BASE}/api/signing-records").json(), list))
test("Verification records (200)", lambda: requests.get(f"{BASE}/api/verification-records").status_code == 200)

# 11. Preview
print("\n[11] Preview")
if rid:
    r = requests.get(f"{BASE}/api/preview/{rid}")
    test("Preview (200)", lambda: r.status_code == 200)
    test("Inline disposition", lambda: "inline" in r.headers.get("content-disposition", ""))
test("Preview nonexistent (404)", lambda: requests.get(f"{BASE}/api/preview/nope").status_code == 404)

# 12. Download-file
print("\n[12] Download-file")
test("Download-file nonexistent (404)", lambda: requests.get(f"{BASE}/api/download-file/nope.pdf").status_code == 404)

# 13. PKCS#11
print("\n[13] PKCS#11")
test("PKCS#11 bad module (404)", lambda: requests.get(f"{BASE}/api/pkcs11/tokens", params={"module_path": "/nope.so"}).status_code == 404)

# 14. Performance
print("\n[14] Performance")
with open(pdf_path, "rb") as f:
    t = time.time()
    requests.post(f"{BASE}/api/sign", files={"file": ("p.pdf", f, "application/pdf")},
                  data={"certificate_id": cert_id, "passphrase": "password", "signer_name": "P"})
    st = time.time() - t
test(f"Sign < 5s ({st:.2f}s)", lambda: st < 5)

with open(signed_path, "rb") as f:
    t = time.time()
    requests.post(f"{BASE}/api/verify", files={"file": ("p.pdf", f, "application/pdf")})
    vt = time.time() - t
test(f"Verify < 3s ({vt:.2f}s)", lambda: vt < 3)

# 15. Edge Cases
print("\n[15] Edge Cases")
r = requests.post(f"{BASE}/api/sign", files={"file": ("e.pdf", b"", "application/pdf")},
                  data={"certificate_id": cert_id, "passphrase": "password"})
test("Empty PDF handled", lambda: r.status_code in [400, 500])

# Security: path traversal
test("Path traversal blocked on /api/pdf/info", lambda: requests.get(f"{BASE}/api/pdf/info", params={"pdf_path": "/etc/passwd"}).status_code == 404)
test("Path traversal with .. blocked", lambda: requests.get(f"{BASE}/api/pdf/info", params={"pdf_path": "../../etc/passwd"}).status_code == 404)

# ─── Summary ───
print("\n" + "=" * 60)
print(f"  RESULTS: {passed} passed, {failed} failed, {passed+failed} total")
print("=" * 60)
if bugs:
    print("\nBUGS FOUND:")
    for b in bugs: print(f"  * {b}")
else:
    print("\nAll tests passed!")
