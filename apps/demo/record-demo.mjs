// Automated demo recording: two headed Chrome windows (shop left, REPRO panel right), paced for viewers.
// Usage: DISPLAY=:0 node record-demo.mjs   (demo :3000 and server :8787 running; ffmpeg started by the caller)
import { chromium } from "playwright";
import path from "node:path";
import { promises as fs } from "node:fs";

const DEMO = "http://localhost:3000";
const PANEL = "file://" + path.resolve("../panel/panel.html");
const PROFILES = process.env.PROFILES ?? "/tmp/repro-record";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (m) => console.log(new Date().toLocaleTimeString(), m);

await fs.rm(PROFILES, { recursive: true, force: true });
const exe = process.env.CHROME; // optional: use Chrome for Testing binary
const common = { headless: false, viewport: null, ignoreDefaultArgs: ["--enable-automation"], executablePath: exe || undefined };
const shopCtx = await chromium.launchPersistentContext(PROFILES + "/shop", { ...common, args: ["--window-position=0,0", "--window-size=960,1080", "--no-first-run", "--hide-scrollbars"] });
const panelCtx = await chromium.launchPersistentContext(PROFILES + "/panel", { ...common, args: ["--window-position=960,0", "--window-size=960,1080", "--no-first-run"] });
const demo = shopCtx.pages()[0] ?? (await shopCtx.newPage());
const panel = panelCtx.pages()[0] ?? (await panelCtx.newPage());

await panel.exposeFunction("__evalBridge", (code) => demo.evaluate(code));
await panel.addInitScript(() => {
  window.chrome = { devtools: { inspectedWindow: { eval: (code, cb) => window.__evalBridge(code).then((r) => cb(r, undefined), (e) => cb(undefined, { value: String(e) })) } } };
});

await fetch(DEMO + "/api/reset?all=1", { method: "POST" }).catch(() => {});
await fetch("http://localhost:8787/incidents", { method: "DELETE" }).catch(() => {});
await demo.goto(DEMO + "/");
await panel.goto(PANEL);
await panel.waitForFunction(() => document.getElementById("server").textContent.includes("connected"));
step("windows up");
await pause(2500);

// --- the user hits the bug ---
const shopClick = async (sel) => { await demo.hover(sel); await pause(500); await demo.click(sel); await pause(1300); };
await shopClick("[data-testid=add-to-cart-enamel-mug]");
await shopClick("[data-testid=go-checkout]");
await pause(800);
await shopClick("[data-testid=continue-guest]");
await demo.click("[data-testid=email]"); await demo.type("[data-testid=email]", "guest@example.com", { delay: 45 }); await pause(600);
await demo.click("[data-testid=password]"); await demo.type("[data-testid=password]", "hunter2", { delay: 45 }); await pause(600);
await shopClick("[data-testid=checkout]");
step("bug triggered");
await panel.waitForSelector("#list .item", { timeout: 8000 });
await pause(3500);

// --- the panel does the rest ---
const panelClick = async (sel, label) => { await panel.waitForSelector(sel, { timeout: 30000 }); await panel.hover(sel); await pause(500); await panel.click(sel); step(label); };
await panelClick("#b-analyze", "analyze");
await panel.waitForSelector("#b-issue", { timeout: 30000 }); await pause(6000);
await panelClick("#b-verify", "verify");
await panel.waitForFunction(() => /Verifier says/.test(document.body.textContent), null, { timeout: 30000 }); await pause(3500);
await panelClick("#b-issue", "issue");
await panel.waitForSelector("#detail a[href*='/issues/'], #b-issue-retry", { timeout: 30000 });
if (await panel.$("#b-issue-retry")) { await panelClick("#b-issue-retry", "issue retry"); await panel.waitForSelector("#detail a[href*='/issues/']", { timeout: 30000 }); }
await pause(3000);
await panelClick("#b-fix", "propose fix");
await panel.waitForSelector("#b-apply", { timeout: 45000 }); await pause(5000);
await panelClick("#b-apply", "apply & verify");
await panel.waitForFunction(() => /fix verified|fix rejected/.test(document.body.textContent), null, { timeout: 60000 }); await pause(3000);
if (await panel.$("#b-pr")) { await panelClick("#b-pr", "open PR"); await panel.waitForSelector("#detail a[href*='/pull/']", { timeout: 30000 }); await pause(3000); }
await panelClick("#b-notify", "notify");
await panel.waitForFunction(() => /sent: slack|no channel|failed/.test(document.body.textContent), null, { timeout: 15000 }); await pause(3500);

// --- dashboard ---
await demo.goto("http://localhost:8787/"); await pause(6000);
step("done");
await shopCtx.close(); await panelCtx.close();
