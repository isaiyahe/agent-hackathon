import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { analyzeIncident } from "./analyze.ts";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

app.post("/analyze", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    return c.json(await analyzeIncident(body));
  } catch (err) {
    // Duck-typed: core and server each resolve their own zod copy, so instanceof fails.
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid incident", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});

// TODO(isaiyah): POST /issue -> github.ts

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  console.log(`repro server on http://localhost:${port}`),
);
