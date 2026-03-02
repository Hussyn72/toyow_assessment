/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif']
      },
      colors: {
        brand: {
          bg: '#f4f6f8',
          ink: '#0f172a',
          line: '#dbe3ea',
          accent: '#0f766e',
          danger: '#b91c1c'
        }
      },
      boxShadow: {
        soft: '0 16px 32px rgba(15, 23, 42, 0.10)'
      }
    }
  },
  plugins: []
}
