import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Mengatur plugin React dan proxy API lokal saat menjalankan Vite. */
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            '/api': 'http://localhost:5000',
        },
    },
})
