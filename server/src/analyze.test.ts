import { describe, expect, it } from "vitest";
import { analyzeIncident, fallbackAnalysis } from "./analyze.ts";
import fixture from "../../packages/core/fixtures/incident.json";
import { Incident } from "../../packages/core/schemas.ts";

const good = {
  title: "Guest checkout 500",
  observed: ["POST /api/checkout returned 500"],
  reproductionSteps: ["Open /checkout", "Click Checkout"],
  hypothesis: "customer is null for guest sessions",
  confidence: "high",
  evidenceGaps: [],
  safetyWarnings: [],
};
const quiet = { log: () => {} };

describe("fallbackAnalysis", () => {
  it("builds a valid analysis from incident facts only", () => {
    const a = fallbackAnalysis(Incident.parse(fixture));
    expect(a.title).toBe("POST /api/checkout returns 500");
    expect(a.reproductionSteps).toEqual(fixture.actions.map((x) => x.label));
    expect(a.observed.join("\n")).toContain("Cannot read properties of null");
    expect(a.confidence).toBe("low");
  });
});

describe("analyzeIncident", () => {
  it("rejects an invalid incident", async () => {
    await expect(analyzeIncident({ nope: true }, quiet)).rejects.toThrow();
  });

  it("returns model output when it is valid", async () => {
    const res = await analyzeIncident(fixture, { ...quiet, runner: async () => good });
    expect(res.source).toBe("model");
    expect(res.analysis.title).toBe("Guest checkout 500");
  });

  it("retries once on malformed output, then uses the model", async () => {
    let calls = 0;
    const runner = async () => (++calls === 1 ? { garbage: true } : good);
    const res = await analyzeIncident(fixture, { ...quiet, runner });
    expect(calls).toBe(2);
    expect(res.source).toBe("model");
  });

  it("falls back after two failures", async () => {
    let calls = 0;
    const runner = async () => {
      calls++;
      throw new Error("boom");
    };
    const res = await analyzeIncident(fixture, { ...quiet, runner });
    expect(calls).toBe(2);
    expect(res.source).toBe("fallback");
    expect(res.analysis.reproductionSteps.length).toBeGreaterThan(0);
  });

  it("falls back on timeout and aborts the runner", async () => {
    let aborted = false;
    const runner = (_: unknown, signal: AbortSignal) =>
      new Promise((_r, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true;
          reject(signal.reason);
        });
      });
    const res = await analyzeIncident(fixture, { ...quiet, runner, timeoutMs: 20 });
    expect(aborted).toBe(true);
    expect(res.source).toBe("fallback");
  });
});
