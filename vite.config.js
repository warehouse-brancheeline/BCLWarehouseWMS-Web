import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Supaya React Router bisa handle semua route saat dev
    historyApiFallback: true,
  },
})
