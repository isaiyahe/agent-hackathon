import { beforeEach, describe, expect, it } from "vitest";
import { clearIncidents, getIncident, incidents, ingestIncident, listIncidents, removeIncident, supabasePersist, updateIncident } from "./incidents.ts";
import fixture from "../../packages/core/fixtures/incident.json";

const noPersist = { persist: async () => {}, log: () => {} };
beforeEach(() => (incidents.length = 0));

describe("ingestIncident", () => {
  it("validates, sanitizes, stores newest first, and dedupes by id", () => {
    ingestIncident({ ...fixture, id: "a" }, noPersist);
    ingestIncident({ ...fixture, id: "b", actions: [{ t: 1, kind: "input", locator: "password", label: "Type password", value: "hunter2" }] }, noPersist);
    ingestIncident({ ...fixture, id: "a" }, noPersist);
    expect(listIncidents().map((r) => r.incident.id)).toEqual(["a", "b"]);
    expect(getIncident("b")!.incident.actions[0].value).toBe("[REDACTED]");
  });
  it("rejects an invalid incident", () => {
    expect(() => ingestIncident({ nope: 1 }, noPersist)).toThrow();
  });
  it("does not throw when persistence fails", async () => {
    const logs: string[] = [];
    ingestIncident(fixture, { persist: async () => { throw new Error("db down"); }, log: (m) => logs.push(m) });
    await new Promise((r) => setTimeout(r, 0));
    expect(logs[0]).toContain("db down");
    expect(incidents.length).toBe(1);
  });
  it("removes one and clears all", () => {
    ingestIncident({ ...fixture, id: "a" }, noPersist);
    ingestIncident({ ...fixture, id: "b" }, noPersist);
    expect(removeIncident("a")).toBe(true);
    expect(removeIncident("a")).toBe(false);
    expect(listIncidents().map((r) => r.incident.id)).toEqual(["b"]);
    expect(clearIncidents()).toBe(1);
    expect(incidents.length).toBe(0);
  });
  it("updates a stored row", () => {
    ingestIncident(fixture, noPersist);
    expect(updateIncident(fixture.id, { replayOutcome: "reproduced", issueUrl: "https://x/1" })!.issueUrl).toBe("https://x/1");
    expect(updateIncident("nope", {})).toBeUndefined();
  });
  it("rejects patches that touch anything outside the whitelist", () => {
    ingestIncident(fixture, noPersist);
    expect(() => updateIncident(fixture.id, { incident: { id: "evil" } })).toThrow();
    expect(() => updateIncident(fixture.id, { source: "extension" })).toThrow();
    expect(() => updateIncident(fixture.id, JSON.parse('{"__proto__":{"polluted":true}}'))).toThrow();
    expect(() => updateIncident(fixture.id, { issueUrl: "not a url" })).toThrow();
    expect(({} as any).polluted).toBeUndefined();
    expect(getIncident(fixture.id)!.incident.id).toBe(fixture.id);
  });
});

describe("supabasePersist", () => {
  const row = ingestIncident(fixture, noPersist);
  it("is a no-op without env", async () => {
    let called = false;
    await supabasePersist(row, {} as any, (async () => ((called = true), { ok: true })) as any);
    expect(called).toBe(false);
  });
  it("posts an upsert with the secret key", async () => {
    let seen: any;
    await supabasePersist(row, { SUPABASE_URL: "https://p.supabase.co", SUPABASE_SECRET_KEY: "fake-secret-x" } as any, (async (url: string, init: any) => ((seen = { url, init }), { ok: true })) as any);
    expect(seen.url).toBe("https://p.supabase.co/rest/v1/incidents");
    expect(seen.init.headers.apikey).toBe("fake-secret-x");
    expect(JSON.parse(seen.init.body)).toMatchObject({ id: fixture.id, endpoint: "/api/checkout", status: 500 });
  });
  it("throws on a non-2xx so the caller can log it", async () => {
    await expect(supabasePersist(row, { SUPABASE_URL: "https://p.supabase.co", SUPABASE_SECRET_KEY: "k" } as any, (async () => ({ ok: false, status: 404, text: async () => "relation does not exist" })) as any)).rejects.toThrow(/404/);
  });
});
