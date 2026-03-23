/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9f9',
          100: '#d1eeee',
          200: '#a3dddd',
          300: '#75cccc',
          400: '#47bbbb',
          500: '#1a9a9a',
          600: '#147a7a',
          700: '#104f4f',
          800: '#0c3a3a',
          900: '#082525',
        }
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
