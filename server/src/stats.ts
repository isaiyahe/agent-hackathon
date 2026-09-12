import { incidents, type StoredIncident } from "./incidents.ts";

export interface Stats {
  now: string;
  windowMinutes: number;
  total: number;
  lastHour: number;
  perMinute: { t: string; n: number }[];       // oldest -> newest, windowMinutes buckets
  rate: { last15: number; prev15: number; deltaPct: number | null; direction: "up" | "down" | "flat" };
  byEndpoint: { endpoint: string; method: string; status: number; n: number; lastSeen: string }[];
  byStatus: { status: number; n: number }[];
  bySeverity: { severity: string; n: number }[];
  byOutcome: { outcome: string; n: number }[];
  fixes: { proposedOrVerified: number; prs: number; issues: number };
}

export function computeStats(rows: StoredIncident[] = incidents, now = new Date(), windowMinutes = 60): Stats {
  const nowMs = now.getTime();
  const winStart = nowMs - windowMinutes * 60_000;
  const inWindow = rows.filter((r) => new Date(r.receivedAt).getTime() >= winStart);

  const buckets: { t: string; n: number }[] = [];
  for (let i = windowMinutes - 1; i >= 0; i--) {
    const start = nowMs - (i + 1) * 60_000;
    buckets.push({ t: new Date(start).toISOString(), n: 0 });
  }
  for (const r of inWindow) {
    const idx = windowMinutes - 1 - Math.floor((nowMs - new Date(r.receivedAt).getTime()) / 60_000);
    if (idx >= 0 && idx < windowMinutes) buckets[idx].n++;
  }
  const last15 = buckets.slice(-15).reduce((a, b) => a + b.n, 0);
  const prev15 = buckets.slice(-30, -15).reduce((a, b) => a + b.n, 0);
  const deltaPct = prev15 === 0 ? (last15 === 0 ? 0 : null) : Math.round(((last15 - prev15) / prev15) * 100);
  const direction = last15 > prev15 ? "up" : last15 < prev15 ? "down" : "flat";

  const count = <K extends string | number>(keyOf: (r: StoredIncident) => K | undefined) => {
    const m = new Map<K, number>();
    for (const r of rows) { const k = keyOf(r); if (k !== undefined) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };
  const ep = new Map<string, { endpoint: string; method: string; status: number; n: number; lastSeen: string }>();
  for (const r of rows) {
    const f = r.incident.failedRequest, k = `${f.method} ${f.endpoint} ${f.status}`;
    const e = ep.get(k) ?? { endpoint: f.endpoint, method: f.method, status: f.status, n: 0, lastSeen: r.receivedAt };
    e.n++; if (r.receivedAt > e.lastSeen) e.lastSeen = r.receivedAt; ep.set(k, e);
  }
  const toArr = <K extends string | number>(m: Map<K, number>, name: string) =>
    [...m.entries()].map(([k, n]) => ({ [name]: k, n })).sort((a, b) => (b.n as number) - (a.n as number));

  return {
    now: now.toISOString(),
    windowMinutes,
    total: rows.length,
    lastHour: inWindow.length,
    perMinute: buckets,
    rate: { last15, prev15, deltaPct, direction },
    byEndpoint: [...ep.values()].sort((a, b) => b.n - a.n),
    byStatus: toArr(count((r) => r.incident.failedRequest.status), "status") as Stats["byStatus"],
    bySeverity: toArr(count((r) => r.analysis?.severity), "severity") as Stats["bySeverity"],
    byOutcome: toArr(count((r) => r.replayOutcome), "outcome") as Stats["byOutcome"],
    fixes: {
      proposedOrVerified: rows.filter((r) => r.prUrl || r.replayOutcome === "not_reproduced").length,
      prs: rows.filter((r) => r.prUrl).length,
      issues: rows.filter((r) => r.issueUrl).length,
    },
  };
}
