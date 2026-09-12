import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// TODO(isaiyah): POST /analyze -> analyze.ts, POST /issue -> github.ts

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () => console.log(`repro server on http://localhost:${port}`));
