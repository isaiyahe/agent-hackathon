import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'REPRO',
    description:
      'Witnesses a web failure, reconstructs reproduction steps, verifies the bug, and drafts a GitHub issue.',
  },
});
