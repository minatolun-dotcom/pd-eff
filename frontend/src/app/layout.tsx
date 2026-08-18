import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pd-eff - PDF Digital Signing",
  description: "Digital PDF signing and signature verification — pd-eff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-gray-50">
          {/* Header */}
          <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-4 sm:px-6">
              <div className="flex items-center justify-between h-14">
                <a href="/" className="flex items-center gap-2">
                  <span className="text-xl">🔐</span>
                  <span className="font-bold text-gray-900">pd-eff</span>
                </a>
                <nav className="flex gap-1">
                  <a
                    href="/"
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    📝 Sign
                  </a>
                  <a
                    href="/verify"
                    className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    ✅ Verify
                  </a>
                </nav>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
