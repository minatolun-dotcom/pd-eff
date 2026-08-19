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
          <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
            {/* Header */}
            <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-gray-950/80 border-b border-gray-200/60 dark:border-gray-800/60 transition-colors duration-300">
              <div className="max-w-6xl mx-auto px-4 sm:px-6">
                <div className="flex items-center justify-between h-16">
                  {/* Logo */}
                  <a href="/" className="flex items-center gap-3 group">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md shadow-blue-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all">
                      🔐
                    </div>
                    <div>
                      <span className="font-bold text-gray-900 dark:text-white text-lg tracking-tight">pd-eff</span>
                      <span className="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 ml-2 font-medium">PDF Signing</span>
                    </div>
                  </a>

                  {/* Navigation */}
                  <nav className="flex items-center gap-1 bg-gray-100/80 dark:bg-gray-800/80 rounded-2xl p-1">
                    <a
                      href="/"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      <span>📝</span>
                      <span className="hidden sm:inline">Sign</span>
                    </a>
                    <a
                      href="/verify"
                      className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl transition-all hover:bg-white dark:hover:bg-gray-700 hover:shadow-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                    >
                      <span>✅</span>
                      <span className="hidden sm:inline">Verify</span>
                    </a>
                  </nav>

                  {/* Right: Theme toggle + Version */}
                  <div className="flex items-center gap-2">
                    <ThemeToggle />
                    <span className="hidden md:inline text-xs text-gray-400 dark:text-gray-600 bg-gray-100 dark:bg-gray-800 px-2.5 py-1 rounded-full font-medium">v1.2.0</span>
                  </div>
                </div>
              </div>
            </header>

            {/* Main content */}
            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 animate-fadeIn">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
