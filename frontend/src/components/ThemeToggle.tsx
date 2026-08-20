"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, resolved, setTheme } = useTheme();

  const cycle = () => {
    const order: Array<"light" | "dark" | "system"> = ["light", "dark", "system"];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const icon = theme === "system" ? "🖥️" : resolved === "dark" ? "🌙" : "☀️";
  const label = theme === "system" ? "System" : resolved === "dark" ? "Dark" : "Light";

  return (
    <button
      onClick={cycle}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
      title={`Theme: ${label} (click to cycle)`}
      aria-label={`Switch theme, currently ${label}`}
    >
      <span className="text-sm transition-transform duration-200 hover:rotate-12">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
