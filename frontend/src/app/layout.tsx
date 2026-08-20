import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "pd-eff — PDF Digital Signing",
  description: "Secure digital PDF signing and signature verification",
  icons: { icon: '/favicon.svg' },
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
            <Sidebar />

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
