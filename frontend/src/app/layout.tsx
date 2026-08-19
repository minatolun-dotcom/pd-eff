import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pd-eff — PDF Digital Signing",
  description: "Secure digital PDF signing and signature verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          {/* Header */}
          <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-gray-200/60">
            <div className="max-w-6xl mx-auto px-4 sm:px-6">
              <div className="flex items-center justify-between h-16">
                {/* Logo */}
                <a href="/" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md shadow-blue-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all">
                    🔐
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 text-lg tracking-tight">pd-eff</span>
                    <span className="hidden sm:inline text-xs text-gray-400 ml-2 font-medium">PDF Signing</span>
                  </div>
                </a>

                {/* Navigation */}
                <nav className="flex items-center gap-1 bg-gray-100/80 rounded-2xl p-1">
                  <a
                    href="/"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:bg-white hover:shadow-sm text-gray-600 hover:text-gray-900"
                  >
                    <span>📝</span>
                    <span className="hidden sm:inline">Sign</span>
                  </a>
                  <a
                    href="/verify"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:bg-white hover:shadow-sm text-gray-600 hover:text-gray-900"
                  >
                    <span>✅</span>
                    <span className="hidden sm:inline">Verify</span>
                  </a>
                </nav>

                {/* Version badge */}
                <div className="hidden md:flex items-center">
                  <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full font-medium">v1.2.0</span>
                </div>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fadeIn">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
