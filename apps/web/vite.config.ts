import react from '@vitejs/plugin-react';
import { defineConfig, type ProxyOptions } from 'vite';

// The browser talks to a single origin and the dev server forwards /api/* to the API,
// so local development needs no CORS setup. Production is expected to sit behind a reverse
// proxy with the same layout, or to set VITE_API_URL to the absolute API URL.
const apiProxy: Record<string, ProxyOptions> = {
  '/api': {
    target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
  },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: apiProxy },
  preview: { port: 4173, proxy: apiProxy },
});
