const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api";

export interface Certificate {
  id: string;
  name: string;
  filename: string;
  subject_cn: string;
  subject_o: string;
  issuer_cn: string;
  serial_number: string;
  not_valid_before: string | null;
  not_valid_after: string | null;
  is_self_signed: boolean;
  key_algorithm: string;
  created_at: string | null;
}

export interface SigningRecord {
  id: string;
  original_filename: string;
  signed_filename: string;
  signer_name: string;
  signature_type: string;
  signed_at: string | null;
  download_url: string;
}

export interface CertificateChain {
  subject_cn: string;
  subject_full: string;
  issuer_cn: string;
  issuer_full: string;
  serial_number: string;
  is_self_signed: boolean;
}

export interface SignatureDetail {
  field_name: string;
  intact: boolean;
  valid: boolean;
  trust_status: string;
  signer: {
    common_name: string;
    organization: string;
    email: string;
    issuer_cn: string;
    serial_number: string;
    valid_from: string | null;
    valid_to: string | null;
    self_signed: boolean;
    pem?: string;
  };
  timestamps: Record<string, string>;
  details: Record<string, string>;
  errors: string[];
  certificates?: CertificateChain[];
}

export interface VerificationResult {
  id: string;
  filename: string;
  is_valid: boolean;
  signature_count: number;
  signatures: SignatureDetail[];
  overall_status: string;
  verified_at: string;
  error?: string;
}

// ─── Certificates ────────────────────────────────────────────────

export async function uploadCertificate(
  file: File,
  name: string,
  passphrase: string
): Promise<Certificate> {
  const form = new FormData();
  form.append("file", file);
  form.append("name", name);
  form.append("passphrase", passphrase);

  const res = await fetch(`${API_BASE}/certificates`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to upload certificate");
  }
  return res.json();
}

export async function generateCertificate(
  commonName: string,
  organization: string
): Promise<Certificate & { passphrase: string; message: string }> {
  const form = new FormData();
  form.append("common_name", commonName);
  form.append("organization", organization);

  const res = await fetch(`${API_BASE}/certificates/generate`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to generate certificate");
  }
  return res.json();
}

export async function listCertificates(): Promise<Certificate[]> {
  const res = await fetch(`${API_BASE}/certificates`);
  if (!res.ok) throw new Error("Failed to fetch certificates");
  return res.json();
}

export async function deleteCertificate(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/certificates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete certificate");
}

// ─── Signing ─────────────────────────────────────────────────────

export async function signPdf(
  file: File,
  certificateId: string,
  passphrase: string,
  signerName: string,
  visible: boolean
): Promise<{
  id: string;
  signed_filename: string;
  field_name: string;
  signer_name: string;
  timestamp: string;
  download_url: string;
}> {
  const form = new FormData();
  form.append("file", file);
  form.append("certificate_id", certificateId);
  form.append("passphrase", passphrase);
  form.append("signer_name", signerName);
  form.append("visible", String(visible));

  const res = await fetch(`${API_BASE}/sign`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to sign PDF");
  }
  return res.json();
}

export async function listSigningRecords(): Promise<SigningRecord[]> {
  const res = await fetch(`${API_BASE}/signing-records`);
  if (!res.ok) throw new Error("Failed to fetch signing records");
  return res.json();
}

export function getDownloadUrl(recordId: string): string {
  return `${API_BASE}/download/${recordId}`;
}

// ─── PKCS#11 ─────────────────────────────────────────────────────

export interface Pkcs11Token {
  slot_id: number;
  label: string;
  serial_number: string;
  model: string;
  manufacturer: string;
  has_keypad: boolean;
}

export async function listPkcs11Tokens(modulePath: string): Promise<Pkcs11Token[]> {
  const res = await fetch(`${API_BASE}/pkcs11/tokens?module_path=${encodeURIComponent(modulePath)}`);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to list PKCS#11 tokens");
  }
  const data = await res.json();
  return data.tokens || [];
}

export async function signPdfWithPkcs11(
  file: File,
  modulePath: string,
  tokenLabel: string,
  pin: string,
  keyLabel: string,
  signerName: string,
  visible: boolean
): Promise<{
  id: string;
  signed_filename: string;
  field_name: string;
  signer_name: string;
  timestamp: string;
  token_label: string;
  download_url: string;
}> {
  const form = new FormData();
  form.append("file", file);
  form.append("module_path", modulePath);
  form.append("token_label", tokenLabel);
  form.append("pin", pin);
  form.append("key_label", keyLabel);
  form.append("signer_name", signerName);
  form.append("visible", String(visible));

  const res = await fetch(`${API_BASE}/sign/pkcs11`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "PKCS#11 signing failed");
  }
  return res.json();
}

// ─── Verification ────────────────────────────────────────────────

export async function verifyPdf(file: File): Promise<VerificationResult> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/verify`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to verify PDF");
  }
  return res.json();
}

// ─── Trust Store ────────────────────────────────────────────────

export interface TrustedCert {
  id: string;
  name: string;
  subject_cn: string;
  subject_o: string;
  issuer_cn: string;
  serial_number: string;
  not_valid_before: string | null;
  not_valid_after: string | null;
  is_self_signed: boolean;
  purpose: string;
  added_at: string | null;
}

export interface ExtractResult {
  id: string;
  name: string;
  subject_cn: string;
  total_certs: number;
  all_certs: Array<{ index: number; cn: string; issuer: string }>;
  message: string;
}

export async function listTrustStore(): Promise<TrustedCert[]> {
  const res = await fetch(`${API_BASE}/trust-store`);
  if (!res.ok) throw new Error("Failed to fetch trust store");
  return res.json();
}

export async function addToTrustStore(name: string, pemData: string, purpose: string = "signing"): Promise<ExtractResult> {
  const form = new FormData();
  form.append("name", name);
  form.append("pem_data", pemData);
  form.append("purpose", purpose);

  const res = await fetch(`${API_BASE}/trust-store`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to add to trust store");
  }
  return res.json();
}

export async function removeFromTrustStore(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/trust-store/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to remove from trust store");
}

export async function extractAndTrust(
  file: File,
  certIndex: number,
  name: string,
  purpose: string = "signing"
): Promise<ExtractResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("certificate_index", String(certIndex));
  form.append("name", name);
  form.append("purpose", purpose);

  const res = await fetch(`${API_BASE}/trust-store/extract`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to extract and trust");
  }
  return res.json();
}

export async function verifyWithTrustStore(file: File): Promise<VerificationResult & { trusted_store_used: number }> {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/verify/trusted`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to verify with trust store");
  }
  return res.json();
}

export interface BulkExtractResult {
  total_found: number;
  added: number;
  skipped: number;
  certificates: Array<{ cn: string; serial: string }>;
  skipped_details: Array<{ cn: string; serial: string; reason: string }>;
  message: string;
}

export async function extractAndTrustBulk(file: File, purpose: string = "signing"): Promise<BulkExtractResult> {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);

  const res = await fetch(`${API_BASE}/trust-store/extract-bulk`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to extract certificates");
  }
  return res.json();
}

export interface CaBundleResult {
  bundle: string;
  added: number;
  skipped: number;
  certificates: string[];
  skipped_details: string[];
  message: string;
}

export async function loadCaBundle(bundle: string = "india"): Promise<CaBundleResult> {
  const form = new FormData();
  form.append("bundle", bundle);

  const res = await fetch(`${API_BASE}/trust-store/bundle`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Failed to load CA bundle");
  }
  return res.json();
}
