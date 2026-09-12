import { describe, expect, it } from "vitest";
import { normalizeEndpoint, verify } from "./verify";
import fixture from "./fixtures/incident.json";

const target = { failedRequest: fixture.failedRequest, runtimeError: fixture.runtimeError };

describe("normalizeEndpoint", () => {
  it("strips ids and query strings", () => {
    expect(normalizeEndpoint("http://localhost:3000/api/orders/123?x=1")).toBe("/api/orders/:id");
    expect(normalizeEndpoint("/api/checkout/")).toBe("/api/checkout");
  });
});

describe("verify", () => {
  it("reproduced when same endpoint, method, status, and error", () => {
    expect(verify(target, { completed: true, failedRequest: fixture.failedRequest, runtimeError: fixture.runtimeError })).toBe("reproduced");
  });
  it("not_reproduced when flow completes with no failure", () => {
    expect(verify(target, { completed: true, failedRequest: null })).toBe("not_reproduced");
  });
  it("diverged when a different status appears", () => {
    expect(verify(target, { completed: true, failedRequest: { ...fixture.failedRequest, status: 404 } })).toBe("diverged");
  });
  it("inconclusive when replay could not complete", () => {
    expect(verify(target, { completed: false, failedRequest: null })).toBe("inconclusive");
  });
  it("ignores the runtime error if replay did not capture one", () => {
    expect(verify(target, { completed: true, failedRequest: fixture.failedRequest })).toBe("reproduced");
  });
});
