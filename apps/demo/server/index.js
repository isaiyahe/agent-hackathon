import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const CATALOG = [
  { sku: "demo-item", name: "Demo item", price: 19, blurb: "One of these is all it takes to reach checkout.", tint: "#e9efe9" },
  { sku: "field-notebook", name: "Field notebook", price: 12, blurb: "Dot grid, 96 pages, lies flat.", tint: "#efe9e2" },
  { sku: "enamel-mug", name: "Enamel mug", price: 16, blurb: "Camp classic. Dishwasher safe.", tint: "#e6ecf1" },
  { sku: "wool-beanie", name: "Wool beanie", price: 24, blurb: "Merino, one size, three colors.", tint: "#f0e8ec" },
];

// In-memory demo state. Reset with POST /api/reset (session only) or /api/reset?all=1.
let state = freshState();
function freshState() {
  return { cart: [], customer: null, orders: [] };
}

const bootedAt = new Date().toISOString();
app.get("/api/state", (_req, res) => res.json({ ...state, bootedAt }));

app.get("/api/catalog", (_req, res) => res.json(CATALOG));

// Default reset clears the session (customer, guest, orders) but keeps the cart,
// so REPRO can replay the checkout steps against the same cart. ?all=1 clears everything.
app.post("/api/reset", (req, res) => {
  const cart = req.query.all ? [] : state.cart;
  state = { ...freshState(), cart };
  res.json({ ok: true, cart: state.cart });
});

app.post("/api/cart", (req, res) => {
  const sku = req.body?.sku ?? "demo-item";
  const product = CATALOG.find((p) => p.sku === sku) ?? CATALOG[0];
  const existing = state.cart.find((i) => i.sku === product.sku);
  if (existing) existing.qty += 1;
  else state.cart.push({ sku: product.sku, name: product.name, qty: 1, price: product.price });
  res.json({ ok: true, cart: state.cart });
});

app.delete("/api/cart/:sku", (req, res) => {
  state.cart = state.cart.filter((i) => i.sku !== req.params.sku);
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

app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "shop.html")));
app.get("/checkout", (_req, res) =>
  res.sendFile(path.join(__dirname, "..", "public", "index.html")),
);

const port = process.env.PORT ?? 3000;
app.listen(port, () => console.log(`demo shop on http://localhost:${port}/`));
