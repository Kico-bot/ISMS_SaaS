/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Akzent der Suite; Zustandsfarben sind bewusst davon getrennt (Ampel ≠ Marke).
        brand: {
          50: '#f2f2fd',
          100: '#e7e6fb',
          200: '#d2d0f8',
          500: '#6d5ae6',
          600: '#5b46d8',
          700: '#4c38ba',
          900: '#2e2172',
        },
        level: {
          low: '#15803d',
          medium: '#a16207',
          high: '#c2410c',
          critical: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
