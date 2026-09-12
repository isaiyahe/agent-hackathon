import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { analyzeIncident } from "./analyze.ts";
import { createIssue } from "./github.ts";

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

app.post("/issue", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const res = await createIssue(body);
    return c.json(res, res.ok ? 200 : 502);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid issue request", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  console.log(`repro server on http://localhost:${port}`),
);
