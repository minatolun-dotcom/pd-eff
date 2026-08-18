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
  };
  timestamps: Record<string, string>;
  details: Record<string, string>;
  errors: string[];
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
