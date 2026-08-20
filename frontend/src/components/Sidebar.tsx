"use client";

import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const navItems = [
  { href: "/", icon: "📝", label: "Sign", title: "Sign PDF" },
  { href: "/verify", icon: "✅", label: "Verify", title: "Verify Signatures" },
  { href: "/certificates", icon: "📜", label: "Certificates", title: "Certificates" },
  { href: "/audit", icon: "📋", label: "Audit Log", title: "Audit Log" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-16 lg:w-56 shrink-0 bg-white dark:bg-gray-950 border-r border-gray-200/60 dark:border-gray-800/60 flex flex-col transition-colors duration-300 z-40">
      {/* Logo */}
      <a href="/" className="flex items-center gap-3 px-4 h-14 border-b border-gray-200/60 dark:border-gray-800/60 shrink-0 group">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-lg shadow-md shadow-blue-500/20 group-hover:shadow-lg group-hover:shadow-blue-500/30 transition-all shrink-0">
          🔐
        </div>
        <span className="hidden lg:inline font-bold text-gray-900 dark:text-white text-lg tracking-tight">pd-eff</span>
      </a>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-1" aria-label="Main navigation">
        {navItems.map(({ href, icon, label, title }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <a
              key={href}
              href={href}
              className={`nav-item group ${isActive ? "active" : ""}`}
              title={title}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="nav-icon">{icon}</span>
              <span className="hidden lg:inline nav-label">{label}</span>
            </a>
          );
        })}
      </nav>

      {/* Bottom actions */}
      <div className="py-3 px-2 border-t border-gray-200/60 dark:border-gray-800/60 space-y-1">
        <ThemeToggle />
        <div className="hidden lg:flex items-center justify-center py-2">
          <span className="text-[10px] text-gray-500 dark:text-gray-500 font-medium">v1.5.0</span>
        </div>
      </div>
    </aside>
  );
}
