/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19',
        panel: '#151C2C',
        border: '#2A3441',
        primary: '#EE4C2C',
        primaryHover: '#D93B1F',
        textMain: '#F8FAFC',
        textMuted: '#94A3B8',
        nodeBg: '#1E293B',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
