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
| `POST /api/checkout` guest: any JSON object except `"guest": false`, e.g. `{"guest":true}` or the demo app's `{"checkoutMode":"guest"}` | `500 {"error":"Cannot read properties of null (reading 'id')","code":"GUEST_USER_NULL"}` and header `X-Repro-Demo: guest-user-null` |
| `POST /api/checkout` `{"guest":false}`     | `200 {"success":true}`                                                                        |
| `POST /api/checkout` body is invalid JSON or not an object | `400 {"error":"Request body must be a JSON object","code":"INVALID_REQUEST"}`  |

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

The demo app (`apps/demo`) fetches the relative URL `/api/checkout`, and its Vite dev server
proxies `/api` to `DEMO_API_TARGET`. Start the demo with that variable set. If it is missing,
the checkout request returns 404 instead of the seeded 500:

```bash
cd apps/demo && DEMO_API_TARGET=http://127.0.0.1:3001 npm run dev
```

Through the proxy the request is same-origin, so CORS does not apply. In DevTools it appears as
`POST http://localhost:5173/api/checkout` with status 500.

To call this server directly from another page, use the snippet below. CORS allows only the
Vite demo origin (port 5173); set `CORS_ORIGINS` to change it.

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

## Privacy

The request log prints only method, path, status, and timing. It never prints headers, cookies,
query strings, or bodies. No secrets are required.
