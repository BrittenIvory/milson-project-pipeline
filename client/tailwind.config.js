/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#dae5ff',
          200: '#bcd0ff',
          300: '#8eb0ff',
          400: '#5a84ff',
          500: '#3459f7',
          600: '#1f39e4',
          700: '#1b2cb8',
          800: '#1c2892',
          900: '#1c2873',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
      },
    },
  },
  plugins: [],
};
