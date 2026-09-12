# REPRO — Team Plan (build day)

Hard stop is **3:30**. Video is recorded at **3:00**. Feature freeze at **2:40**.
Full product blueprint is in [`REPRO_BUILD.md`](REPRO_BUILD.md). This file is
who does what, in what order, and the contract everyone codes against.

## Clock

| Time | What |
|---|---|
| 1:05–1:20 | Contract + scaffold (this file, schema, fixture, empty apps) |
| 1:20–2:15 | Build in parallel against the fixture |
| 2:15–2:40 | Integrate. **Feature freeze at 2:40.** |
| 2:40–3:00 | Rehearse the demo three times. Fix blockers only. |
| 3:00–3:15 | Record the two-minute video, one take if possible |
| 3:15–3:30 | README, push, confirm repo is public, submit in portal |

## Scope

**Ship:**

1. Demo checkout page with a seeded `500` on `POST /api/checkout`.
2. Chrome DevTools panel named **REPRO** showing captured actions, the failed
   request, and the AI-generated reproduction steps + hypothesis.
3. **Verify** button that replays and reports `reproduced` / `not_reproduced` /
   `diverged` / `inconclusive`.
4. **Create GitHub Issue** button that creates a real issue after approval.
5. Two visible failure states: OpenAI timeout still shows captured facts;
   GitHub failure offers **Copy Markdown**.

**Stretch, gated at 2:15 (see "Stage 5: Fix" below):** an implementer agent
patches the seeded bug, and the same replay verifier proves the fix.

**Cut unless everything above works by 2:15:** runtime error capture,
general-purpose replay, source lookup, fancy redaction, anything not in the
demo script.

**Fallbacks (decide at the time, don't debate):**

| By | If | Then |
|---|---|---|
| 1:35 | WXT DevTools panel doesn't render | Plain Manifest V3 `devtools_page` + Vite |
| 2:15 | Click replay is flaky | Verify re-sends the failing request via `inspectedWindow.eval` and compares endpoint + status |
| 2:25 | OpenAI structured output is fighting you | Deterministic summary from the incident facts |
| 2:30 | GitHub issue creation fails | Copy Markdown button is the demo |
| 2:15 | Verify + Create Issue are **not both** working end to end | Fix stage is cut. It becomes the "what's next" line in the video. No exceptions. |

## Ownership

Nobody edits files outside their directories. If you need something from
someone else's area, ask out loud.

### Brother — frontend. Owns `apps/extension/` and `apps/demo/` UI

- WXT + React scaffold, DevTools panel named REPRO. **Timebox 15 min.**
- `capture.content.ts`: rolling buffer (last 20) of semantic actions
  (click / input / navigation) using `data-testid` and visible text as locators.
- Network detection via `chrome.devtools.network.onRequestFinished` for
  status >= 400 on the allowlisted endpoint.
- Panel UI: actions list, failed request card, analysis card, Verify button,
  Create Issue button, Copy Markdown button, status badges.
- Replayer: walks `incident.actions`, clicks by `data-testid`, stops and
  reports `inconclusive` if a locator is missing.
- Build the panel against `packages/core/fixtures/incident.json` first. Do not
  wait on the server.
- Demo page markup: every interactive element gets a `data-testid`.
- **After the 2:15 gate only:** Fix button (enabled only when Verify said
  `reproduced`), diff view, Apply button, second Verify run with a
  "fix verified" / "fix rejected" badge.

### Isaiyah — backend. Owns `server/`, `packages/core/`, and `apps/demo/server`

- `apps/demo/server`: Express, serves the demo page, `POST /api/checkout`
  returns 500 with `Cannot read properties of null (reading "id")` when guest
  checkout is used. Add `POST /api/reset` for a Reset Demo button.
- `packages/core/schemas.ts`: Zod for `Incident` and `IncidentAnalysis` (below).
- `packages/core/sanitize.ts`: drop cookies/auth headers, mask password inputs,
  strip token-like query params, truncate stacks.
- `packages/core/verify.ts`: pure function, `(target, observed) => outcome`.
- `server/src/analyze.ts`: `POST /analyze`, OpenAI structured output, retry
  once, then deterministic fallback. 15s timeout.
- `server/src/github.ts`: `POST /issue`, Octokit, returns issue URL. On
  failure returns the markdown so the panel can offer Copy.
- `.env.example` with `OPENAI_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPO`.
- **After the 2:15 gate only:** `server/src/fix.ts` (`POST /fix`,
  `POST /fix/apply`, `POST /fix/revert`) per Stage 5 below.

### Sister + girlfriend — submission. Own `README.md`, `docs/`, the portal

You both have Claude / Codex. Use it for everything on this list: paste this
file and `REPRO_BUILD.md` in as context and ask it to draft. Two rules:

- **Only commit `README.md` and files under `docs/`.** If the assistant offers
  to change anything else, say no. That is how we avoid merge conflicts.
- **Never paste an API key or token into the assistant, a commit, or a doc.**

Do these now, in this order:

1. Create a **public** GitHub repo for issues to land in (e.g. `repro-demo-target`)
   and a GitHub personal access token with `repo` scope. Hand the token to
   Isaiyah privately. **Never paste it into chat, a commit, or a doc.**
2. Get the OpenAI key from the sponsor portal. Same handling.
3. Check the portal: exact submission deadline, every form field, which
   partners must be tagged in the social post, and what the Ambiguous AI and
   other sponsor prizes actually require.
4. Draft the project title, written description, and social post. Use the
   pitch lines from `REPRO_BUILD.md` ("Demo script" and "Positioning"). Put
   drafts in `docs/submission.md` so everyone can read them.
5. Write the two-minute video script as a shot list with timestamps
   (0–15 what it is, 15–30 the problem, 30–100 the live demo, 100–120 why the
   browser matters and what's next). Save it to `docs/video-script.md`.
6. Set up screen recording (OBS or the built-in recorder) and do one test
   recording so 3:00 is not the first time it runs.
7. From 2:00: run the demo path as a user, over and over, and report anything
   that breaks with the exact click that broke it.
8. One of you is **timekeeper**. Call out 2:15, 2:40, 3:00, 3:15 loudly.
9. At 3:15: draft the README rewrite with the assistant: what it is, how to
   run it (three commands from the "Run it" section below), what environment
   it lives in, and which parts were built during the event (answer: all
   application code; only docs existed before 11:15). Confirm the repo is
   public. Confirm no keys in `git log -p`.

## Git rules

- Everyone commits straight to `main`. Small commits, often. No branches, no PRs.
- `git pull --rebase` before every push.
- No npm workspaces. `apps/demo`, `apps/extension`, and `server` each have
  their own `package.json` and lockfile. Import `packages/core` by relative
  path. This avoids lockfile conflicts.
- Developers do not touch `README.md` until 3:15. Submission pair does not
  touch anything outside `README.md` and `docs/`.
- The Incident shape below does not change after 1:20 without saying so out
  loud to the whole table.

## The contract

### Incident (extension -> server)

```ts
import { z } from "zod";

export const Action = z.object({
  t: z.number(),                                   // ms since capture start
  kind: z.enum(["click", "input", "navigate"]),
  locator: z.string(),                             // data-testid or text
  label: z.string().max(80),                       // human-readable, e.g. "Click Checkout"
  value: z.string().max(80).optional(),            // masked for sensitive inputs
});

export const FailedRequest = z.object({
  method: z.string(),
  url: z.string(),                                 // sanitized, no tokens
  endpoint: z.string(),                            // normalized path, e.g. "/api/checkout"
  status: z.number(),
});

export const RuntimeError = z.object({
  message: z.string().max(300),
  stack: z.string().max(1000).optional(),
});

export const Incident = z.object({
  id: z.string(),
  capturedAt: z.string(),                          // ISO
  page: z.object({ url: z.string(), title: z.string() }),
  actions: z.array(Action).max(20),
  failedRequest: FailedRequest,
  runtimeError: RuntimeError.optional(),
});

export const IncidentAnalysis = z.object({
  title: z.string().max(100),
  observed: z.array(z.string()).max(6),
  reproductionSteps: z.array(z.string()).min(1).max(8),
  hypothesis: z.string().max(320),
  confidence: z.enum(["high", "medium", "low"]),
  evidenceGaps: z.array(z.string()).max(4),
  safetyWarnings: z.array(z.string()).max(3),
});

export const ReplayOutcome = z.enum([
  "reproduced", "not_reproduced", "diverged", "inconclusive",
]);
```

### Endpoints (server, default `http://localhost:8787`)

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/analyze` | `Incident` | `{ analysis: IncidentAnalysis, source: "model" \| "fallback" }` |
| POST | `/issue` | `{ incident, analysis, replay: { outcome, observed? } }` | `{ ok: true, url }` or `{ ok: false, markdown }` |
| GET | `/health` | | `{ ok: true }` |

| POST | `/fix` | `{ incident, analysis }` | `{ ok: true, diff, files: string[], explanation }` or `{ ok: false, reason }` |
| POST | `/fix/apply` | `{ diff }` | `{ ok: true }` (applies, restarts demo app) |
| POST | `/fix/revert` | | `{ ok: true }` |

Replay and verify run entirely in the extension. `verify(target, observed)`
compares `endpoint` + `status` (+ normalized `runtimeError.message` if both
present). The model never decides whether the bug reproduced.

### Fixture

`packages/core/fixtures/incident.json` is the guest-checkout incident from
`REPRO_BUILD.md`. The panel renders it before any capture code exists.

## Run it

```bash
cd apps/demo && npm install && npm run dev        # http://localhost:3000/checkout
cd server && npm install && cp .env.example .env && npm run dev   # http://localhost:8787
cd apps/extension && npm install && npm run dev   # load .output/chrome-mv3 as unpacked
```

## Stage 5: Fix (stretch, gate 2:15)

The loop becomes **witness → reconstruct → verify → fix → verify again.**
The same deterministic verifier that proved the bug proves the fix. The model
never gets to say "I fixed it"; replay returning `not_reproduced` says it.

**Gate:** start only if Verify and Create Issue both work end to end at 2:15.
Otherwise it is the "what's next" line in the video and nothing more.

**Flow:**

1. Panel: **Fix** button, enabled only when the last Verify was `reproduced`.
2. `POST /fix`: an agent with **one tool**, `editFile(path, contents)`,
   restricted to `apps/demo/server/**`. Input is the incident, the analysis,
   and the current contents of the allowlisted files. Output is a unified diff
   and a one-paragraph explanation. Nothing is written to disk.
3. Panel shows the diff. User clicks **Apply**. Nothing is applied without
   this click.
4. `POST /fix/apply` writes the files and restarts the demo app
   (`apps/demo` runs under `node --watch`, so a file write is enough).
5. Panel re-runs the same replay. `not_reproduced` = **fix verified**.
   Anything else = **fix rejected**, and the panel calls `POST /fix/revert`.

**Guardrails (these are the criterion 3 points):**

- Path allowlist enforced in `/fix/apply`, not just in the prompt.
- Diff size cap (reject > 60 changed lines).
- Explicit approval before apply. Automatic revert on failed re-verify.
- Model timeout 30s; on timeout the panel shows "no fix proposed" and the
  issue path still works.

**Failure states:** agent proposes a diff touching a disallowed path →
`{ ok: false, reason: "path not allowed" }`. Diff does not apply cleanly →
revert, show "fix rejected". Re-verify is `diverged` → revert, show the new
signature.

## Demo script (what the video shows)

1. Open the demo, add item, continue as guest, click Checkout. It fails.
2. REPRO panel already shows the actions, the 500, and the error.
3. Show reproduction steps + hypothesis.
4. Click **Verify**. Badge says **reproduced**.
5. Click **Create GitHub Issue**. Open the issue.
6. Show one failure state (kill the server, click Verify or Create Issue,
   show the fallback).
7. **If Stage 5 shipped:** click **Fix**, show the diff, click **Apply**,
   click **Verify** again, badge flips to **fix verified**.

> "The model never decides whether the bug reproduced. Capture, replay,
> signature matching, and issue creation are deterministic."
