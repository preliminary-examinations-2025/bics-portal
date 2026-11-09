import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/public': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true
      },
      '/media/otrf': {
        target: 'https://res.cloudinary.com/dl7xqcnmr/raw/upload/BICS_2026',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media\/otrf/, '/otrf')
      },
      '/media/raw': {
        target: 'https://res.cloudinary.com/dl7xqcnmr/raw/upload/BICS_2026',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/media\/raw/, '')
      },
      '/media': {
        target: 'https://res.cloudinary.com/dl7xqcnmr/image/upload',
        changeOrigin: true,
        rewrite: (path) => {
          const stripped = path.replace(/^\/media/, '');
          const verMatch = stripped.match(/^\/(v\d+)(\/.*)$/);
          if (verMatch) return `/${verMatch[1]}/BICS_2026${verMatch[2]}`;
          return `/BICS_2026${stripped}`;
        }
      }
    }
  }
})
