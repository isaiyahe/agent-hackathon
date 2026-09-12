import { describe, expect, it } from "vitest";
import { buildMessage, channelsFromEnv, notify } from "./notify.ts";
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
const base = { incident: fixture, analysis, replay: { outcome: "reproduced" } };
const quiet = { log: () => {} };
const okFetch = (async () => ({ ok: true, status: 200 })) as any;

describe("buildMessage", () => {
  it("leads with severity and says what the agent did", () => {
    const m = buildMessage({ ...base, issueUrl: "https://github.com/x/y/issues/1", fix: { status: "verified", prUrl: "https://github.com/x/y/pull/2" } } as any);
    expect(m.split("\n")[0]).toBe("🟠 *HIGH* — Guest checkout returns 500");
    expect(m).toContain("Impact: Guests cannot complete checkout");
    expect(m).toContain("POST /api/checkout → 500");
    expect(m).toContain("Agent fixed it and replay confirmed");
    expect(m).toContain("PR: https://github.com/x/y/pull/2");
    expect(m).toContain("Issue: https://github.com/x/y/issues/1");
  });
  it("says no fix attempted by default", () => {
    expect(buildMessage(base as any)).toContain("No fix attempted");
  });
});

describe("channelsFromEnv", () => {
  it("returns nothing when unconfigured, slack and telegram when set", () => {
    expect(channelsFromEnv({})).toEqual([]);
    expect(channelsFromEnv({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/x" }).map((c) => c.name)).toEqual(["slack"]);
    expect(channelsFromEnv({ TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "1" }).map((c) => c.name)).toEqual(["telegram"]);
  });
  it("posts slack text and telegram chat_id", async () => {
    const calls: any[] = [];
    const f = (async (url: string, init: any) => (calls.push({ url, body: JSON.parse(init.body) }), { ok: true, status: 200 })) as any;
    const chs = channelsFromEnv({ SLACK_WEBHOOK_URL: "https://hooks.slack.com/x", TELEGRAM_BOT_TOKEN: "tok", TELEGRAM_CHAT_ID: "42" });
    for (const ch of chs) await ch.send("hi *there*", new AbortController().signal, f);
    expect(calls[0].body).toEqual({ text: "hi *there*" });
    expect(calls[1].url).toContain("/bottok/sendMessage");
    expect(calls[1].body).toEqual({ chat_id: "42", text: "hi there" });
  });
});

describe("notify", () => {
  it("rejects an invalid body", async () => {
    await expect(notify({ nope: 1 }, quiet)).rejects.toThrow();
  });
  it("returns configured:false with the message when no channel is set", async () => {
    const r = await notify(base, { ...quiet, channels: [] });
    expect(r).toMatchObject({ ok: true, configured: false, sent: [] });
    expect(r.message).toContain("HIGH");
  });
  it("reports per-channel success and failure without throwing", async () => {
    const r = await notify(base, {
      ...quiet,
      fetcher: okFetch,
      channels: [
        { name: "good", send: async () => {} },
        { name: "bad", send: async () => { throw new Error("401"); } },
      ],
    });
    expect(r.ok).toBe(false);
    expect(r.sent).toEqual(["good"]);
    expect(r.failed).toEqual([{ channel: "bad", reason: "401" }]);
  });
  it("times out a hanging channel", async () => {
    const r = await notify(base, {
      ...quiet,
      timeoutMs: 20,
      channels: [{ name: "slow", send: (_t, signal) => new Promise((_r, rej) => signal.addEventListener("abort", () => rej(signal.reason))) }],
    });
    expect(r.failed[0].reason).toBe("notify timeout");
  });
});
