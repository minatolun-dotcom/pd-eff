"use client";

import { useState, useEffect } from "react";

interface SigningRecord {
  id: string;
  original_filename: string;
  signed_filename: string;
  signer_name: string;
  signature_type: string;
  signed_at: string | null;
  download_url: string;
}

interface VerificationRecord {
  id: string;
  filename: string;
  is_valid: boolean;
  signature_count: number;
  verified_at: string | null;
}

interface Stats {
  totalSignatures: number;
  totalVerifications: number;
  validCount: number;
  invalidCount: number;
  uniqueSigners: Set<string>;
}

export default function AuditPage() {
  const [signingRecords, setSigningRecords] = useState<SigningRecord[]>([]);
  const [verificationRecords, setVerificationRecords] = useState<VerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "signing" | "verification">("all");

  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    Promise.all([
      fetch(`${apiUrl}/api/signing-records`).then(r => r.json()),
      fetch(`${apiUrl}/api/verification-records`).then(r => r.json()),
    ])
      .then(([signs, verifs]) => {
        setSigningRecords(signs);
        setVerificationRecords(verifs);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // Calculate stats
  const stats = {
    totalSignatures: signingRecords.length,
    totalVerifications: verificationRecords.length,
    validCount: verificationRecords.filter(v => v.is_valid).length,
    invalidCount: verificationRecords.filter(v => !v.is_valid).length,
    uniqueSigners: new Set(signingRecords.map(r => r.signer_name)).size,
  };

  // Merge and sort all records by date
  const allRecords = [
    ...signingRecords.map(r => ({
      type: "signing" as const,
      id: r.id,
      filename: r.original_filename,
      details: `Signed by ${r.signer_name}`,
      date: r.signed_at,
      status: "signed",
      download_url: r.download_url,
    })),
    ...verificationRecords.map(r => ({
      type: "verification" as const,
      id: r.id,
      filename: r.filename,
      details: `${r.signature_count} signature(s) found`,
      date: r.verified_at,
      status: r.is_valid ? "valid" : "invalid",
      download_url: null,
    })),
  ].sort((a, b) => {
    if (!a.date || !b.date) return 0;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  const filteredRecords = filter === "all"
    ? allRecords
    : allRecords.filter(r => r.type === filter);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">📊 Audit Dashboard</h2>
        <p className="text-gray-600 dark:text-gray-400 dark:text-gray-500">
          Complete history of all signing and verification operations.
          Track who signed what, when, and the verification status.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="📝"
          label="Total Signatures"
          value={stats.totalSignatures}
          color="blue"
        />
        <StatCard
          icon="🔍"
          label="Total Verifications"
          value={stats.totalVerifications}
          color="purple"
        />
        <StatCard
          icon="✅"
          label="Valid Signatures"
          value={stats.validCount}
          color="green"
        />
        <StatCard
          icon="👥"
          label="Unique Signers"
          value={stats.uniqueSigners}
          color="orange"
        />
      </div>

      {/* Invalid signatures warning */}
      {stats.invalidCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div>
            <p className="font-medium text-red-800">
              {stats.invalidCount} verification(s) failed
            </p>
            <p className="text-sm text-red-600">
              Some documents have invalid or tampered signatures.
            </p>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { id: "all" as const, label: "📋 All", count: allRecords.length },
          { id: "signing" as const, label: "📝 Signing", count: signingRecords.length },
          { id: "verification" as const, label: "✅ Verification", count: verificationRecords.length },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              filter === tab.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200"
            }`}
          >
            {tab.label}
            <span className="ml-2 bg-white dark:bg-gray-900/20 px-2 py-0.5 rounded-full text-xs">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Records table */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center">
          <div className="text-5xl mb-4">📭</div>
          <p className="text-gray-500 dark:text-gray-400 dark:text-gray-500">No records found</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  File
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 dark:text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRecords.map(record => (
                <tr key={`${record.type}-${record.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-800">
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        record.type === "signing"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {record.type === "signing" ? "📝 Signing" : "🔍 Verification"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900 dark:text-white text-sm truncate max-w-[200px]">
                      {record.filename}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">{record.details}</p>
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={record.status} />
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 dark:text-gray-500">
                      {record.date
                        ? new Date(record.date).toLocaleString()
                        : "N/A"}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    {record.download_url && (
                      <a                         href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}${record.download_url}`}
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        ⬇️ Download
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 border-blue-200",
    green: "bg-green-50 border-green-200",
    purple: "bg-purple-50 border-purple-200",
    orange: "bg-orange-50 border-orange-200",
    red: "bg-red-50 border-red-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    signed: "bg-blue-100 text-blue-800",
    valid: "bg-green-100 text-green-800",
    invalid: "bg-red-100 text-red-800",
    pending: "bg-yellow-100 text-yellow-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${
        styles[status] || styles.pending
      }`}
    >
      {status}
    </span>
  );
}
