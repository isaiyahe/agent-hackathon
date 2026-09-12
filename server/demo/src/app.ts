import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { placeOrder, resolveUser } from './checkout.js';

/** Local demo frontend (Vite dev server) only. Override with CORS_ORIGINS=origin1,origin2. */
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const app = new Hono();

// Logs method, path, status, and timing only: never headers, cookies, query strings, or bodies.
app.use(async (c, next) => {
  const started = performance.now();
  await next();
  console.log(`${c.req.method} ${c.req.path} -> ${c.res.status} (${Math.round(performance.now() - started)}ms)`);
});

app.use(
  cors({
    origin: allowedOrigins,
    allowMethods: ['GET', 'POST'],
    exposeHeaders: ['X-Repro-Demo'],
  }),
);

app.get('/health', (c) => c.json({ status: 'ok' }));

app.post('/api/checkout', async (c) => {
  const body: unknown = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Request body must be a JSON object', code: 'INVALID_REQUEST' }, 400);
  }

  // Only an explicit `"guest": false` checks out as the signed-in demo user. Anything else is a guest,
  // including `{"guest": true}` and the demo app's `{"checkoutMode": "guest"}`.
  const guest = (body as { guest?: unknown }).guest !== false;
  const user = resolveUser(guest);
  try {
    placeOrder(user);
  } catch (err) {
    if (user === null && err instanceof TypeError) {
      // The real error (with stack) stays in the server log; the response carries only the message and a stable code.
      console.error('[repro-demo] seeded guest checkout bug fired:', err);
      c.header('X-Repro-Demo', 'guest-user-null');
      return c.json({ error: err.message, code: 'GUEST_USER_NULL' }, 500);
    }
    throw err;
  }

  return c.json({ success: true });
});
