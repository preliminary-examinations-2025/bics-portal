import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/assessment/',
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/public': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/media': {
        target: 'https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, '')
      }
    }
  }
})
