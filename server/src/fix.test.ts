import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { applyFix, buildProposal, countChangedLines, isAllowedPath, proposeFix, revertFix, store } from "./fix.ts";
import fixture from "../../packages/core/fixtures/incident.json";

const analysis = {
  title: "Guest checkout returns 500",
  severity: "high",
  impact: "Guests cannot complete checkout; revenue is blocked.",
  observed: ["POST /api/checkout returned 500"],
  reproductionSteps: ["Open /checkout", "Click Checkout"],
  hypothesis: "customer is null for guest sessions",
  confidence: "high",
  evidenceGaps: [],
  safetyWarnings: [],
};
const req = { incident: fixture, analysis };
const quiet = { log: () => {} };

const SRC = `let state = { customer: null };
function createOrder(s) {
  const customerId = s.customer.id;
  return { customerId };
}
`;

let root: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "repro-fix-"));
  await fs.mkdir(path.join(root, "apps/demo/server"), { recursive: true });
  await fs.writeFile(path.join(root, "apps/demo/server/index.js"), SRC);
  store.proposals.clear();
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

const goodEdit = {
  path: "apps/demo/server/index.js",
  oldSnippet: "const customerId = s.customer.id;",
  newSnippet: "const customerId = s.customer?.id ?? null;",
  explanation: "Guests have no customer record; default to null.",
};

describe("isAllowedPath", () => {
  it("allows only the demo server dir", () => {
    expect(isAllowedPath("apps/demo/server/index.js")).toBe(true);
    expect(isAllowedPath("apps/demo/server/../../../server/src/index.ts")).toBe(false);
    expect(isAllowedPath("server/src/github.ts")).toBe(false);
    expect(isAllowedPath("/etc/passwd")).toBe(false);
  });
});

describe("buildProposal", () => {
  const files = { "apps/demo/server/index.js": SRC };
  it("produces a unified diff with the change", () => {
    const p = buildProposal(goodEdit, files);
    expect(p.diff).toContain("-  const customerId = s.customer.id;");
    expect(p.diff).toContain("+  const customerId = s.customer?.id ?? null;");
    expect(p.changedLines).toBe(2);
    expect(p.after).toContain("s.customer?.id");
  });
  it("rejects a disallowed path even if contents are provided", () => {
    expect(() => buildProposal({ ...goodEdit, path: "server/src/index.ts" }, { "server/src/index.ts": SRC })).toThrow(/not allowed/);
  });
  it("rejects a snippet that is missing or not unique", () => {
    expect(() => buildProposal({ ...goodEdit, oldSnippet: "nope" }, files)).toThrow(/not found/);
    expect(() => buildProposal({ ...goodEdit, oldSnippet: "customer" }, files)).toThrow(/not unique/);
  });
  it("rejects a no-op and an oversized diff", () => {
    expect(() => buildProposal({ ...goodEdit, newSnippet: goodEdit.oldSnippet }, files)).toThrow(/no change/);
    const big = { ...goodEdit, newSnippet: Array.from({ length: 70 }, (_, i) => `x${i};`).join("\n") };
    expect(() => buildProposal(big, files)).toThrow(/too large/);
  });
  it("counts changed lines ignoring headers", () => {
    expect(countChangedLines("--- a\n+++ b\n@@ @@\n-x\n+y\n+z\n")).toBe(3);
  });
});

describe("proposeFix / applyFix / revertFix", () => {
  it("proposes from the model edit, applies to disk, and reverts", async () => {
    let sawPrompt = "";
    const res = await proposeFix(req, { ...quiet, root, runner: async (prompt) => ((sawPrompt = prompt), goodEdit) });
    expect(res.ok).toBe(true);
    expect(sawPrompt).toContain("### apps/demo/server/index.js");
    expect(sawPrompt).toContain("s.customer.id");
    if (!res.ok) return;

    const applied = await applyFix(res.proposalId, root);
    expect(applied.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "apps/demo/server/index.js"), "utf8")).toContain("s.customer?.id ?? null");

    const reverted = await revertFix(res.proposalId, root);
    expect(reverted.ok).toBe(true);
    expect(await fs.readFile(path.join(root, "apps/demo/server/index.js"), "utf8")).toBe(SRC);
  });

  it("returns ok:false when the model targets a disallowed path", async () => {
    const res = await proposeFix(req, { ...quiet, root, runner: async () => ({ ...goodEdit, path: "server/src/index.ts" }) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/not allowed|not provided/);
  });

  it("returns ok:false on timeout", async () => {
    const res = await proposeFix(req, {
      ...quiet,
      root,
      timeoutMs: 20,
      runner: (_p, signal) => new Promise((_r, rej) => signal.addEventListener("abort", () => rej(signal.reason))),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("fix timeout");
  });

  it("refuses to apply if the file changed since the proposal", async () => {
    const res = await proposeFix(req, { ...quiet, root, runner: async () => goodEdit });
    if (!res.ok) throw new Error("expected proposal");
    await fs.writeFile(path.join(root, "apps/demo/server/index.js"), SRC + "\n// edited\n");
    const applied = await applyFix(res.proposalId, root);
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.reason).toMatch(/changed/);
  });

  it("rejects an unknown proposal id", async () => {
    expect((await applyFix("nope", root)).ok).toBe(false);
    expect((await revertFix("nope", root)).ok).toBe(false);
  });
});
