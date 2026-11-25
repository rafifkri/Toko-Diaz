import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GitHub Pages melayani di /<nama-repo>/. Nama repo diambil otomatis dari GITHUB_REPOSITORY (mis. user/Toko-Diaz) agar tidak salah ketik.
  base: process.env.GITHUB_PAGES === 'true' ? `/${process.env.GITHUB_REPOSITORY?.split('/')[1] ?? 'Toko-Diaz'}/` : '/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Pustaka besar dipisah agar halaman awal (login, kasir) tetap ringan
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@supabase/supabase-js'],
          charts: ['recharts'],
        },
      },
    },
  },
})
