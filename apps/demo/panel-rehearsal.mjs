// Full rehearsal: real Chromium, demo page + panel page. The panel's DevTools eval is bridged to the demo page.
import { chromium } from "playwright";
import path from "node:path";

const DEMO = "http://localhost:3000";
const PANEL = "file://" + path.resolve("../panel/panel.html");
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };
const step = (m) => console.log("  ·", m);

const browser = await chromium.launch();
const ctx = await browser.newContext();
const demo = await ctx.newPage();
const panel = await ctx.newPage();

await panel.exposeFunction("__evalBridge", (code) => demo.evaluate(code));
await panel.addInitScript(() => {
  window.chrome = { devtools: { inspectedWindow: { eval: (code, cb) => window.__evalBridge(code).then((r) => cb(r, undefined), (e) => cb(undefined, { value: String(e) })) } } };
});
panel.on("pageerror", (e) => fail("panel page error: " + e.message));

await demo.goto(`${DEMO}/checkout`);
await panel.goto(PANEL);
await panel.waitForFunction(() => document.getElementById("server").textContent.includes("connected"), null, { timeout: 5000 });
step("panel connected to server");

// 1. user hits the bug
await demo.click("[data-testid=add-item]");
await demo.click("[data-testid=continue-guest]");
await demo.fill("[data-testid=email]", "guest@example.com");
const [resp] = await Promise.all([demo.waitForResponse((r) => r.url().endsWith("/api/checkout")), demo.click("[data-testid=checkout]")]);
if (resp.status() !== 500) fail("expected 500");
step("bug triggered in the demo page");

// 2. panel shows it
await panel.waitForSelector("#list .item", { timeout: 6000 });
const first = await panel.textContent("#list .item");
if (!/POST \/api\/checkout/.test(first)) fail("panel did not list the incident: " + first);
step("panel lists the incident: " + first.replace(/\s+/g, " ").trim());

// 3. analyze
await panel.click("#b-analyze");
await panel.waitForSelector("#b-issue", { timeout: 25000 });
const title = await panel.textContent("#detail .card:nth-of-type(2) strong");
step("analysis: " + title);

// 4. verify by replay
await panel.click("#b-verify");
await panel.waitForFunction(() => /reproduced|diverged|inconclusive/.test(document.querySelector("#detail .card .badge:last-of-type")?.textContent || "") && !/replaying/.test(document.body.textContent), null, { timeout: 20000 });
const log1 = await panel.textContent("#detail .card:last-of-type pre");
const verdict = (log1.match(/Verifier says: (\w+)/) || [])[1];
if (verdict !== "reproduced") fail("verify verdict: " + verdict + "\n" + log1);
step("replay verdict: reproduced");

// 5. issue
await panel.click("#b-issue");
await panel.waitForSelector("#detail a[href*='/issues/']", { timeout: 20000 });
const issueUrl = await panel.getAttribute("#detail a[href*='/issues/']", "href");
step("issue: " + issueUrl);

// 6. fix
await panel.click("#b-fix");
await panel.waitForSelector("#b-apply", { timeout: 40000 });
step("fix proposed, diff shown");
await panel.click("#b-apply");
await panel.waitForFunction(() => /fix verified|fix rejected/.test(document.body.textContent), null, { timeout: 40000 });
const fixState = (await panel.textContent("body")).includes("fix verified by replay") ? "verified" : "rejected";
if (fixState !== "verified") fail("fix was rejected:\n" + (await panel.textContent("#detail .card:last-of-type pre")));
step("fix applied and verified by replay");

// 7. PR
await panel.click("#b-pr");
await panel.waitForSelector("#detail a[href*='/pull/']", { timeout: 25000 });
const prUrl = await panel.getAttribute("#detail a[href*='/pull/']", "href");
step("PR: " + prUrl);

// 8. notify
await panel.click("#b-notify");
await panel.waitForFunction(() => /sent: slack|no channel configured|failed/.test(document.body.textContent), null, { timeout: 10000 });
const notifyBadge = await panel.textContent("#detail .card:nth-last-of-type(2) .badge");
step("notify: " + notifyBadge);

await browser.close();
console.log(JSON.stringify({ issueUrl, prUrl }));
console.log("PASS: full panel loop");
