import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone preview of the REPRO panel in a normal browser tab, driven by mock
// data. The panel UI has no chrome.* dependencies, so it renders outside DevTools.
export default defineConfig({
  root: 'entrypoints/devtools-panel',
  plugins: [react()],
  server: { port: 5174 },
});
