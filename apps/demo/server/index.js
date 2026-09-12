import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// In-memory demo state. Reset with POST /api/reset.
let state = freshState();
function freshState() {
  return { cart: [], customer: null, orders: [] };
}

const bootedAt = new Date().toISOString();
app.get("/api/state", (_req, res) => res.json({ ...state, bootedAt }));

app.post("/api/reset", (_req, res) => {
  state = freshState();
  res.json({ ok: true });
});

app.post("/api/cart", (req, res) => {
  const item = { sku: req.body?.sku ?? "demo-item", qty: 1, price: 19 };
  state.cart.push(item);
  res.json({ ok: true, cart: state.cart });
});

app.post("/api/session/guest", (req, res) => {
  // THE SEEDED BUG: guest sessions never get a customer record.
  // Registered users would land in state.customer; guests stay null.
  state.guestEmail = req.body?.email ?? null;
  res.json({ ok: true, guest: true });
});

app.post("/api/checkout", (_req, res) => {
  try {
    const order = createOrder(state);
    state.orders.push(order);
    res.json({ ok: true, order });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

function createOrder(s) {
  if (s.cart.length === 0) throw new Error("Cart is empty");
  // Deterministic failure for guest checkout: s.customer is null.
  const customerId = s.customer.id; // TypeError: Cannot read properties of null (reading 'id')
  return { id: `ord_${Date.now()}`, customerId, items: s.cart };
}

app.get("/checkout", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html")),
);

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`demo shop on http://localhost:${port}/checkout`));
