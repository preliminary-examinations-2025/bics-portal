import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/terminal/',
  plugins: [react()],
  server: {
    proxy: {
      '/media': {
        target: 'https://res.cloudinary.com/dl7xqcnmr/image/upload/BICS_2026',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media/, '')
      }
    }
  }
})
