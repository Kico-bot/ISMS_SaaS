/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /*
         * Akzent der Suite: ein tiefes, leicht entsättigtes Blau („Trust Blue“). Violett war
         * freundlich, aber beliebig — eine Plattform, in der Zertifizierungsnachweise und
         * Meldefristen liegen, soll nach Aufsicht und Technik aussehen, nicht nach Startup.
         * Zustandsfarben sind bewusst davon getrennt (Ampel ≠ Marke).
         */
        brand: {
          50: '#f0f5fa',
          100: '#dbe8f5',
          200: '#b9d2ea',
          300: '#8bb4da',
          400: '#558fc6',
          500: '#2f6fae',
          600: '#1f5892',
          700: '#1a4676',
          800: '#17385c',
          900: '#132a44',
        },
        /* Zweitfarbe für Auswertungen und Fortschritt — Blau allein ergibt keine Grafik. */
        accent: {
          50: '#eafaf7',
          100: '#cbf2ea',
          200: '#99e4d6',
          300: '#5ccdb9',
          400: '#2bb09a',
          500: '#128f7d',
          600: '#0d7364',
          700: '#0e5c51',
        },
        /* Navigationsspalte: dunkles Schieferblau, damit Inhalt und Menü klar getrennt sind. */
        ink: {
          700: '#1d3148',
          800: '#152538',
          900: '#0e1b29',
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
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04)',
        pop: '0 8px 24px -8px rgb(15 23 42 / 0.25)',
      },
    },
  },
  plugins: [],
};
