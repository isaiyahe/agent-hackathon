# REPRO demo app

The controlled checkout page REPRO observes. React + TypeScript + Vite, no UI library.

## Run

```bash
cd apps/demo
npm install
DEMO_API_TARGET=http://localhost:<api-port> npm run dev   # http://localhost:5173/checkout
```

Vite proxies `/api/*` to `DEMO_API_TARGET` (shell env or `apps/demo/.env.local`). Without it,
`POST /api/checkout` gets a 404 from Vite and the page shows its generic failure message.
Port 5173 is strict: the dev server fails instead of moving to another port.

`npm run build` runs `tsc --noEmit` then `vite build`. `npm run preview` serves the build on 4173 with the same proxy.

## Flow

1. **Add Demo Item** (`add-demo-item`): cart shows REPRO Demo Item, subtotal/total $49.00. Clicking again changes nothing.
2. **Continue as Guest** (`continue-as-guest`): enabled after step 1, shows "Guest checkout enabled".
3. **Checkout** (`checkout`): enabled after step 2, sends `POST /api/checkout`.
   Non-2xx or network error → "Something went wrong." · 2xx → "Order placed".

State is in memory only, so a reload always starts at step 1. Button labels never change, and all
three buttons stay rendered. Each step commits synchronously, so scripted back-to-back `.click()`
calls work.

## Automation hooks

The page root `[data-testid="checkout-page"]` carries `data-state`:
`initial` → `added` → `guest` → `checkout-pending` → `checkout-failed` | `checkout-succeeded`.

| data-testid | Element |
|---|---|
| `add-demo-item`, `continue-as-guest`, `checkout` | The three flow buttons |
| `product-card`, `product-name`, `product-price` | Product section |
| `item-added`, `guest-checkout`, `guest-checkout-enabled` | Step confirmations / guest section |
| `order-summary`, `cart-empty`, `cart-item`, `order-subtotal`, `order-total` | Order summary |
| `checkout-error`, `checkout-success` | Checkout result messages |

## Checkout API contract

`src/checkout/checkoutApi.ts` sends:

```json
{ "items": [{ "sku": "repro-demo-item", "quantity": 1 }], "checkoutMode": "guest" }
```

The response body is never rendered, so developer errors stay out of the customer UI.
Only the `fetch` call is wrapped in try/catch. An error thrown while handling the response
(for example a seeded client-side bug) escapes as an unhandled rejection that DevTools and REPRO
can see, and the page still shows "Something went wrong."
