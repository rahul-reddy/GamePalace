import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const workerUrl = process.env.SYNDICATE_WORKER_URL ?? 'http://127.0.0.1:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: workerUrl, ws: true, changeOrigin: false } },
  },
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 4096 },
});
