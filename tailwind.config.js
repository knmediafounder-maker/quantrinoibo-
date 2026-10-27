/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Roboto', 'system-ui', 'sans-serif'] },
      colors: {
        // Bảng màu Material Design
        brand: { 50: '#ffebee', 100: '#ffcdd2', 500: '#f44336', 600: '#f44336', 700: '#d32f2f' },
        md: {
          bg: '#e9e9e9',
          red: '#f44336',
          pink: '#e91e63',
          purple: '#9c27b0',
          indigo: '#3f51b5',
          blue: '#2196f3',
          cyan: '#00bcd4',
          teal: '#009688',
          green: '#4caf50',
          lgreen: '#8bc34a',
          amber: '#ffc107',
          orange: '#ff9800',
          dorange: '#ff5722',
          grey: '#607d8b',
        },
      },
      boxShadow: {
        md1: '0 2px 10px rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
}
