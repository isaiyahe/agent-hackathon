import { describe, expect, it } from "vitest";
import {
  REDACTED,
  dropSecretHeaders,
  maskTokens,
  sanitizeIncident,
  stripSensitiveParams,
} from "./sanitize";
import { Incident } from "./schemas";
import fixture from "./fixtures/incident.json";

describe("stripSensitiveParams", () => {
  it("redacts credential params, keeps others, drops userinfo and hash", () => {
    const out = stripSensitiveParams("https://u:p@x.io/a?token=abc&page=2&api_key=k#frag");
    expect(out).toBe(`https://x.io/a?token=${encodeURIComponent(REDACTED)}&page=2&api_key=${encodeURIComponent(REDACTED)}`);
  });
  it("returns non-URLs untouched", () => {
    expect(stripSensitiveParams("/relative?token=x")).toBe("/relative?token=x");
  });
});

describe("maskTokens", () => {
  it("masks bearer tokens, JWTs, and vendor keys", () => {
    expect(maskTokens("Bearer abcdefghijklmnopqrstu")).toBe(REDACTED);
    expect(maskTokens("jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghijklmnop")).toBe(`jwt ${REDACTED}`);
    expect(maskTokens("key sk-abcdefghijklmnopqrstuvwxyz")).toBe(`key ${REDACTED}`);
    expect(maskTokens("ghp_abcdefghijklmnopqrstuvwxyz")).toBe(REDACTED);
  });
  it("leaves ordinary text alone", () => {
    expect(maskTokens("Cannot read properties of null (reading 'id')")).toBe("Cannot read properties of null (reading 'id')");
  });
});

describe("dropSecretHeaders", () => {
  it("removes cookie and authorization headers", () => {
    const out = dropSecretHeaders([
      { name: "Cookie", value: "a=b" },
      { name: "Authorization", value: "Bearer x" },
      { name: "Content-Type", value: "application/json" },
    ]);
    expect(out.map((h) => h.name)).toEqual(["Content-Type"]);
  });
});

describe("sanitizeIncident", () => {
  const withSecrets = {
    ...fixture,
    page: { ...fixture.page, url: "http://localhost:3000/checkout?session=abc123" },
    actions: [
      ...fixture.actions,
      { t: 5000, kind: "input", locator: "password", label: "Type password", value: "hunter2" },
      { t: 5100, kind: "input", locator: "note", label: "Type note", value: "token ghp_abcdefghijklmnopqrstuvwxyz" },
    ],
    failedRequest: { ...fixture.failedRequest, url: "http://localhost:3000/api/checkout?token=zzz", endpoint: "/api/checkout?token=zzz" },
    runtimeError: { message: "boom", stack: "x".repeat(5000) },
  };

  it("masks sensitive inputs and token-like values, strips params, truncates stacks", () => {
    const out = sanitizeIncident(withSecrets as any);
    const pw = out.actions.find((a) => a.locator === "password")!;
    const note = out.actions.find((a) => a.locator === "note")!;
    expect(pw.value).toBe(REDACTED);
    expect(note.value).toBe(`token ${REDACTED}`);
    expect(out.actions[3].value).toBe("guest@example.com"); // email is not sensitive
    expect(out.page.url).not.toContain("abc123");
    expect(out.failedRequest.url).not.toContain("zzz");
    expect(out.failedRequest.endpoint).toBe("/api/checkout");
    expect(out.runtimeError!.stack!.length).toBe(1000);
  });

  it("still satisfies the Incident schema and is idempotent", () => {
    const once = sanitizeIncident(withSecrets as any);
    expect(() => Incident.parse(once)).not.toThrow();
    expect(sanitizeIncident(once)).toEqual(once);
  });

  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(withSecrets));
    sanitizeIncident(withSecrets as any);
    expect(withSecrets).toEqual(copy);
  });
});
