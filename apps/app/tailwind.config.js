/** @type {import('tailwindcss').Config} */
const rgb = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: rgb('--brand-50'),
          100: rgb('--brand-100'),
          200: rgb('--brand-200'),
          500: rgb('--brand-500'),
          600: rgb('--brand-600'),
          700: rgb('--brand-700'),
          800: rgb('--brand-800'),
          900: rgb('--brand-900'),
        },
        ink: {
          700: rgb('--ink-700'),
          800: rgb('--ink-800'),
          900: rgb('--ink-900'),
        },
        surface: rgb('--surface'),
        clay: {
          DEFAULT: rgb('--clay'),
          50: rgb('--clay-50'),
          800: rgb('--clay-800'),
        },
        scrim: rgb('--scrim'),
        sand: {
          50: rgb('--bg'),
          100: rgb('--brand-100'),
        },
      },
      fontFamily: {
        sans: ['Vazirmatn', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 10px 40px -20px rgb(var(--brand-700) / 0.35)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pop: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        rise: 'rise 0.45s ease-out both',
        pop: 'pop 0.28s ease-out both',
      },
    },
  },
  plugins: [],
};
