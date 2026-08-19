import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";

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
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="flex h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300 overflow-hidden">
            {/* ─── Sidebar ──────────────────────────────────────── */}
            <aside className="w-16 lg:w-56 shrink-0 bg-white dark:bg-gray-950 border-r border-gray-200/60 dark:border-gray-800/60 flex flex-col transition-colors duration-300 z-40">
              {/* Logo */}
              <a href="/" className="flex items-center gap-3 px-4 h-14 border-b border-gray-200/60 dark:border-gray-800/60 shrink-0 group">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md shadow-blue-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all shrink-0">
                  🔐
                </div>
                <span className="hidden lg:inline font-bold text-gray-900 dark:text-white text-lg tracking-tight">pd-eff</span>
              </a>

              {/* Navigation */}
              <nav className="flex-1 py-3 px-2 space-y-1">
                <a href="/" className="nav-item group" title="Sign PDF">
                  <span className="nav-icon">📝</span>
                  <span className="hidden lg:inline nav-label">Sign</span>
                </a>
                <a href="/verify" className="nav-item group" title="Verify Signatures">
                  <span className="nav-icon">✅</span>
                  <span className="hidden lg:inline nav-label">Verify</span>
                </a>
                <a href="/certificates" className="nav-item group" title="Certificates">
                  <span className="nav-icon">📜</span>
                  <span className="hidden lg:inline nav-label">Certificates</span>
                </a>
                <a href="/audit" className="nav-item group" title="Audit Log">
                  <span className="nav-icon">📋</span>
                  <span className="hidden lg:inline nav-label">Audit Log</span>
                </a>
              </nav>

              {/* Bottom actions */}
              <div className="py-3 px-2 border-t border-gray-200/60 dark:border-gray-800/60 space-y-1">
                <ThemeToggle />
                <div className="hidden lg:flex items-center justify-center py-2">
                  <span className="text-[10px] text-gray-400 dark:text-gray-600 font-medium">v1.4.4</span>
                </div>
              </div>
            </aside>

            {/* ─── Main Content ─────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto animate-fadeIn">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
