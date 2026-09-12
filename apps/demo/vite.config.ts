import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The demo app never implements /api itself. Point DEMO_API_TARGET at whichever
// server owns POST /api/checkout (shell env or apps/demo/.env.local):
//   DEMO_API_TARGET=http://localhost:8787 npm run dev
export default defineConfig(({ command, mode }) => {
  const apiTarget = loadEnv(mode, '.', 'DEMO_').DEMO_API_TARGET;

  if (command === 'serve' && !apiTarget) {
    console.warn('[demo] DEMO_API_TARGET is not set: /api/* is not proxied and will 404.');
  }

  const proxy = apiTarget ? { '/api': { target: apiTarget, changeOrigin: true } } : undefined;

  return {
    plugins: [react()],
    // strictPort keeps the demo URL stable instead of silently moving to another port.
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
  };
});
