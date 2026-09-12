import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3001);
// Loopback only by default: this demo API should not be reachable from the network.
const hostname = process.env.HOST ?? '127.0.0.1';

serve({ fetch: app.fetch, port, hostname }, () => {
  console.log(`REPRO demo API listening on http://localhost:${port}`);
});
