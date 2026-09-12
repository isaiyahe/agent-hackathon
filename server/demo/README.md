# REPRO demo API: seeded guest checkout failure

Deterministic failure harness for the REPRO demo. It has no database, no auth, no external
services, and keeps no state between requests, so every request behaves the same and there is
nothing to reset.

## Run

```bash
cd server/demo
npm install
npm run dev        # http://localhost:3001 (tsx watch)
```

`npm start` runs without watch. `npm test`, `npm run typecheck`, and `npm run build` (emits `dist/`, runnable with `node dist/index.js`) are also available.

| Env var        | Default                                          |
| -------------- | ------------------------------------------------ |
| `PORT`         | `3001`                                           |
| `HOST`         | `127.0.0.1` (loopback only)                      |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173`    |

## Endpoints

| Request                                   | Response                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /health`                             | `200 {"status":"ok"}`                                                                         |
| `POST /api/checkout` `{"guest":true,...}`  | `500 {"error":"Cannot read properties of null (reading 'id')","code":"GUEST_USER_NULL"}` and header `X-Repro-Demo: guest-user-null` |
| `POST /api/checkout` `{"guest":false}`     | `200 {"success":true}`                                                                        |
| `POST /api/checkout` without boolean `guest` | `400 {"error":"...","code":"INVALID_REQUEST"}`                                             |

`items` is accepted but ignored.

## The seeded bug

`src/checkout.ts` → `placeOrder()` reads `user!.id`. Guests have no user (`null`), so the
runtime throws a real `TypeError: Cannot read properties of null (reading 'id')`. The route
catches that TypeError and returns the message with the stable code `GUEST_USER_NULL`. The
stack trace is printed only to the server console and never sent in the response. The fix
would be to handle `user === null` before reading `user.id`.

## Verify

```bash
curl -i -X POST http://localhost:3001/api/checkout \
  -H "Content-Type: application/json" \
  -d '{"guest":true,"items":[{"id":"demo-item","quantity":1}]}'
```

## Frontend integration

```ts
const response = await fetch('http://localhost:3001/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ guest: true, items: [{ id: 'demo-item', quantity: 1 }] }),
});

// Optional. The network 500 alone is enough for REPRO. Add this only if you also want a browser-side error.
if (!response.ok) {
  const body = await response.json();
  throw new Error(body.error);
}
```

CORS allows only the Vite demo origin (port 5173). The 500 response carries CORS headers, so
page code can read the body. If Vite moves to another port because 5173 is busy, the browser
blocks the preflight and DevTools shows a CORS error instead of the 500. To avoid that, either
set `strictPort: true` in `apps/demo/vite.config.ts` or start this server with
`CORS_ORIGINS=http://localhost:<port>`.

A same-origin alternative that needs no CORS is a Vite proxy, `server.proxy: { '/api': 'http://127.0.0.1:3001' }`, with `fetch('/api/checkout', ...)`.

## Privacy

The request log prints only method, path, status, and timing. It never prints headers, cookies,
query strings, or bodies. No secrets are required.
