/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        success: '#16a34a',
        danger: '#dc2626',
        warning: '#d97706',
      },
    },
  },
  plugins: [],
}
