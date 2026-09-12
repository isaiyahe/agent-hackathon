import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { analyzeIncident } from "./analyze.ts";
import { createIssue } from "./github.ts";
import { applyFix, proposeFix, revertFix } from "./fix.ts";
import { notify } from "./notify.ts";
import { openFixPr } from "./pr.ts";
import { getIncident, ingestIncident, listIncidents, updateIncident } from "./incidents.ts";

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) => c.json({ ok: true }));

// ---- Intake: the in-app script tag (or the extension) posts incidents here ----
app.post("/incidents", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const source = c.req.header("x-repro-source") === "extension" ? "extension" : "sdk";
    const row = ingestIncident(body, { source });
    return c.json({ ok: true, id: row.incident.id, receivedAt: row.receivedAt }, 201);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid incident", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});
app.get("/incidents", (c) => c.json({ incidents: listIncidents(Number(c.req.query("limit") ?? 50)) }));
app.get("/incidents/:id", (c) => {
  const row = getIncident(c.req.param("id"));
  return row ? c.json(row) : c.json({ ok: false, reason: "not found" }, 404);
});
app.patch("/incidents/:id", async (c) => {
  const patch = await c.req.json().catch(() => ({}));
  const row = updateIncident(c.req.param("id"), patch);
  return row ? c.json(row) : c.json({ ok: false, reason: "not found" }, 404);
});

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

// ---- Stage 5: Fix (gated in the UI; server side is always available) ----
app.post("/fix", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const res = await proposeFix(body);
    return c.json(res, res.ok ? 200 : 422);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid fix request", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});

app.post("/fix/apply", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { proposalId?: string };
  if (!body.proposalId) return c.json({ ok: false, reason: "proposalId required" }, 400);
  const res = await applyFix(body.proposalId);
  return c.json(res, res.ok ? 200 : 409);
});

app.post("/fix/revert", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { proposalId?: string };
  if (!body.proposalId) return c.json({ ok: false, reason: "proposalId required" }, 400);
  const res = await revertFix(body.proposalId);
  return c.json(res, res.ok ? 200 : 409);
});

app.post("/fix/pr", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const res = await openFixPr(body);
    return c.json(res, res.ok ? 200 : 422);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid pr request", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});

app.post("/notify", async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    return c.json(await notify(body));
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return c.json({ ok: false, reason: "invalid notify request", issues: (err as any).issues }, 400);
    }
    throw err;
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, () =>
  console.log(`repro server on http://localhost:${port}`),
);
