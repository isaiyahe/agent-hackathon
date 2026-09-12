// Smoke test: real Chromium drives the demo, the in-app sensor reports the seeded 500 to the REPRO server.
// Usage: node smoke.mjs   (demo on :3000 and server on :8787 must be running)
import { chromium } from "playwright";

const DEMO = process.env.DEMO_URL ?? "http://localhost:3000";
const SERVER = process.env.REPRO_URL ?? "http://localhost:8787";
const fail = (m) => { console.error("FAIL:", m); process.exit(1); };

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));

await page.goto(`${DEMO}/checkout`);
if (!(await page.evaluate(() => !!window.__repro))) {
  await page.addScriptTag({ url: "/repro.js" });
  console.log("note: repro.js was not in the page; injected it for the test");
}
await page.evaluate(() => (window.REPRO_DEBUG = true));

const before = (await (await fetch(`${SERVER}/incidents`)).json()).incidents.length;

await page.click("[data-testid=add-item]");
await page.click("[data-testid=continue-guest]");
await page.fill("[data-testid=email]", "guest@example.com");
await page.fill("[data-testid=password]", "hunter2");
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().endsWith("/api/checkout")),
  page.click("[data-testid=checkout]"),
]);
if (resp.status() !== 500) fail(`expected checkout 500, got ${resp.status()}`);

await page.waitForTimeout(1200);
const { incidents } = await (await fetch(`${SERVER}/incidents`)).json();
if (incidents.length !== before + 1) fail(`expected ${before + 1} incidents, got ${incidents.length}`);
const inc = incidents[0].incident;
const labels = inc.actions.map((a) => a.label);
const checks = [
  [inc.failedRequest.endpoint === "/api/checkout", "endpoint"],
  [inc.failedRequest.status === 500, "status"],
  [inc.failedRequest.method === "POST", "method"],
  [labels.includes("Click Checkout"), `actions include Click Checkout (${labels.join(" | ")})`],
  [labels.some((l) => /Add demo item/.test(l)), "actions include Add demo item"],
  [inc.actions.some((a) => a.locator === "email" && a.value === "guest@example.com"), "email value captured"],
  [inc.actions.some((a) => a.locator === "password" && a.value === "[REDACTED]"), "password redacted"],
  [!!inc.runtimeError && /null|Checkout failed/.test(inc.runtimeError.message), `runtime error attached (${inc.runtimeError?.message})`],
  [incidents[0].source === "sdk", "source is sdk"],
];
let ok = true;
for (const [pass, name] of checks) { console.log(pass ? "  ✓" : "  ✗", name); if (!pass) ok = false; }
await browser.close();
if (!ok) fail("assertions failed");
console.log(`PASS: incident ${inc.id} captured by the in-app sensor with ${inc.actions.length} actions`);
