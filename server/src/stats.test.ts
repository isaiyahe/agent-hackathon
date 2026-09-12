import { describe, expect, it } from "vitest";
import { computeStats } from "./stats.ts";
import fixture from "../../packages/core/fixtures/incident.json";
import type { StoredIncident } from "./incidents.ts";

const now = new Date("2026-09-12T15:00:00Z");
const row = (minsAgo: number, extra: Partial<StoredIncident> = {}, endpoint = "/api/checkout", status = 500): StoredIncident => ({
  incident: { ...(fixture as any), id: "i" + minsAgo + endpoint, failedRequest: { ...fixture.failedRequest, endpoint, status } },
  source: "sdk",
  receivedAt: new Date(now.getTime() - minsAgo * 60_000).toISOString(),
  ...extra,
});

describe("computeStats", () => {
  it("buckets per minute, computes trend, and breaks down", () => {
    const rows = [row(1), row(2), row(3), row(20), row(70), row(5, { analysis: { severity: "high" } as any, replayOutcome: "reproduced", issueUrl: "u", prUrl: "p" }, "/api/cart", 502)];
    const s = computeStats(rows, now);
    expect(s.total).toBe(6);
    expect(s.lastHour).toBe(5);
    expect(s.perMinute.length).toBe(60);
    expect(s.perMinute.reduce((a, b) => a + b.n, 0)).toBe(5);
    expect(s.rate.last15).toBe(4);
    expect(s.rate.prev15).toBe(1);
    expect(s.rate.direction).toBe("up");
    expect(s.rate.deltaPct).toBe(300);
    expect(s.byEndpoint[0]).toMatchObject({ endpoint: "/api/checkout", status: 500, n: 5 });
    expect(s.byStatus).toEqual([{ status: 500, n: 5 }, { status: 502, n: 1 }]);
    expect(s.bySeverity).toEqual([{ severity: "high", n: 1 }]);
    expect(s.byOutcome).toEqual([{ outcome: "reproduced", n: 1 }]);
    expect(s.fixes).toEqual({ proposedOrVerified: 1, prs: 1, issues: 1 });
  });
  it("handles an empty store", () => {
    const s = computeStats([], now);
    expect(s.rate).toEqual({ last15: 0, prev15: 0, deltaPct: 0, direction: "flat" });
    expect(s.byEndpoint).toEqual([]);
  });
});
