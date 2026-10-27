import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' để chạy được cả trên <user>.github.io/<repo>/ lẫn tên miền riêng
export default defineConfig({
  plugins: [react()],
  base: './',
})
