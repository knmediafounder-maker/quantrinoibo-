/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      colors: {
        // Tông ấm: nền kem, chữ nâu đậm, điểm nhấn xanh xô thơm và cam đất
        cream: '#f7f3ee',
        paper: '#fffdfa',
        line: '#ebe4da',
        sand: { DEFAULT: '#efe6da', dark: '#e3d6c5' },
        ink: { DEFAULT: '#2d2823', soft: '#4a423b' },
        muted: '#8c8279',
        sage: { light: '#e8f3ec', DEFAULT: '#7fb89a', dark: '#4f8f6e' },
        clay: { light: '#fbeae0', DEFAULT: '#e0875a', dark: '#b8643a' },
        rose: { light: '#fbe7e4', DEFAULT: '#d65c4f', dark: '#a8402f' },
        sky: { light: '#e7f0f8', DEFAULT: '#6f9fcc', dark: '#3f6f9c' },
        plum: { light: '#f1e9f3', DEFAULT: '#a07ab0', dark: '#74508a' },
        honey: { light: '#fbf1d9', DEFAULT: '#d9a441', dark: '#a8781d' },
        espresso: { DEFAULT: '#3b302a', dark: '#28201b' },
        brand: { 50: '#efe6da', 100: '#e3d6c5', 500: '#3b302a', 600: '#3b302a', 700: '#28201b' },
      },
      boxShadow: {
        soft: '0 1px 2px rgba(45, 40, 35, 0.04), 0 4px 16px rgba(45, 40, 35, 0.05)',
      },
      borderRadius: { xl2: '14px' },
    },
  },
  plugins: [],
}
