import { describe, expect, it } from "vitest";
import { buildIssueMarkdown, createIssue } from "./github.ts";
import fixture from "../../packages/core/fixtures/incident.json";

const analysis = {
  title: "Guest checkout returns 500",
  observed: ["POST /api/checkout returned 500", "TypeError on null customer"],
  reproductionSteps: ["Open /checkout", "Add demo item", "Continue as guest", "Click Checkout"],
  hypothesis: "Guest sessions never populate state.customer, so createOrder dereferences null.",
  confidence: "high",
  evidenceGaps: ["Server-side source not captured"],
  safetyWarnings: [],
};
const req = { incident: fixture, analysis, replay: { outcome: "reproduced" } };
const quiet = { log: () => {} };

describe("buildIssueMarkdown", () => {
  it("includes signature, steps, hypothesis, and verification badge", () => {
    const { title, body } = buildIssueMarkdown(req as any);
    expect(title).toBe(analysis.title);
    expect(body).toContain("`POST /api/checkout`");
    expect(body).toContain("**500**");
    expect(body).toContain("1. Open /checkout");
    expect(body).toContain("4. Click Checkout");
    expect(body).toContain("Reproduced by replay");
    expect(body).toContain("confidence: high");
    expect(body).toContain("Cannot read properties of null");
  });

  it("shows what replay observed when diverged", () => {
    const diverged = {
      ...req,
      replay: {
        outcome: "diverged",
        observed: { completed: true, failedRequest: { ...fixture.failedRequest, status: 404 } },
      },
    };
    const { body } = buildIssueMarkdown(diverged as any);
    expect(body).toContain("Replay diverged");
    expect(body).toContain("→ 404");
  });
});

describe("createIssue", () => {
  it("rejects an invalid body", async () => {
    await expect(createIssue({ incident: {} }, quiet)).rejects.toThrow();
  });

  it("returns the url on success and passes labels", async () => {
    let seen: any;
    const res = await createIssue(req, {
      ...quiet,
      repo: "acme/target",
      creator: async (a) => ((seen = a), { url: "https://github.com/acme/target/issues/7", number: 7 }),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.url).toContain("/issues/7");
    expect(seen.owner).toBe("acme");
    expect(seen.repo).toBe("target");
    expect(seen.labels).toContain("replay:reproduced");
  });

  it("returns ok:false with markdown when GitHub fails", async () => {
    const res = await createIssue(req, {
      ...quiet,
      repo: "acme/target",
      creator: async () => {
        throw new Error("Bad credentials");
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe("Bad credentials");
      expect(res.markdown).toContain("# Guest checkout returns 500");
      expect(res.markdown).toContain("## Steps to reproduce");
    }
  });

  it("returns ok:false with markdown when repo is not configured", async () => {
    const res = await createIssue(req, { ...quiet, repo: "" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("GITHUB_REPO");
  });

  it("times out and still returns markdown", async () => {
    const res = await createIssue(req, {
      ...quiet,
      repo: "acme/target",
      timeoutMs: 20,
      creator: ({ signal }) =>
        new Promise((_r, reject) => signal.addEventListener("abort", () => reject(signal.reason))),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("github timeout");
  });
});
