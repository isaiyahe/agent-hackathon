# REPRO

> Most coding agents wait for you to describe the bug. REPRO was there when it happened.

REPRO is a debugging agent that lives inside **Chrome DevTools**. It watches a web
app fail, captures the clicks and requests that led to the failure, reconstructs
reproduction steps, **proves the bug by replaying it**, files a GitHub issue,
proposes a fix, **proves the fix by replaying again**, opens a pull request, and
pings the team on Slack with the severity. A human approves every action.

**The model never decides whether a bug reproduced or a fix worked. Replay does.**

Built in one day for the global agent hackathon on 12 September 2026.
Team: [@isaiyahe](https://github.com/isaiyahe) (backend, agent, contract),
[@jeremiyahe](https://github.com/jeremiyahe) (extension), Aaliyah and Aiyana (submission, video, docs).

## The loop

```
user hits a bug ─► REPRO witnesses it (clicks, failed request, runtime error)
               ─► Analyze: OpenAI turns the evidence into steps + hypothesis + severity
               ─► Verify: replay the recorded actions; deterministic signature match
               ─► Create GitHub issue (after approval)
               ─► Propose fix: agent returns one exact edit; allowlist + size cap enforced in code
               ─► Apply & verify: replay again; "not reproduced" is the only thing that means fixed
               ─► Open PR with before/after replay evidence (never merges)
               ─► Notify: Slack/Telegram with severity, impact, and links
```

Every hop has a failure state: OpenAI timeout falls back to a deterministic
summary; GitHub failure returns the issue markdown for Copy/Retry; a rejected fix
is reverted automatically; a disallowed edit is refused server-side.

## Run it (3 terminals + Chrome)

```bash
# 1. the demo shop with a seeded guest-checkout 500
cd apps/demo && npm install && npm run dev            # http://localhost:3000/checkout

# 2. the REPRO server (OpenAI, GitHub, Slack keys live here, never in the browser)
cd server && npm install && cp .env.example .env      # fill OPENAI_API_KEY, GITHUB_TOKEN, GITHUB_REPO
npm run dev                                           # http://localhost:8787

# 3. the DevTools panel (plain Manifest V3, no build step)
#    chrome://extensions → Developer mode → Load unpacked → apps/panel
#    open http://localhost:3000/checkout → F12 → "REPRO" tab
```

Then: Add demo item → Continue as guest → Checkout. The panel fills in. Click
**Analyze → Verify by replay → Create GitHub issue → Propose fix → Apply & verify → Open PR → Notify team.**

Automated proof of the whole loop in a real Chromium (needs the three services up):

```bash
cd apps/demo && npm run smoke      # sensor captures the bug → server intake
cd apps/demo && npm run rehearse   # panel drives analyze → verify → issue → fix → PR → notify
```

## Where the browser is load-bearing

- **Capture** uses the page itself: semantic click/input trail with `data-testid`
  locators, failed fetch/XHR, runtime errors. A chatbox can't see any of that.
- **Replay** runs in the inspected page via DevTools. The same recorded actions
  are re-executed and the failure signature (endpoint, method, status, error) is
  compared by a pure function, before the fix and after it.
- **Two witnesses, one contract.** The DevTools panel watches the developer's
  session; a one-line script tag (`apps/demo/public/repro.js`) watches real users
  and posts the same `Incident` shape, so production failures show up in the
  panel too.

## Layout

```
packages/core/     Zod contract (Incident, IncidentAnalysis, ReplayOutcome), pure verifier, sanitizer, fixture
apps/demo/         Express demo shop with the seeded bug, in-app sensor (repro.js), smoke + rehearsal tests
apps/panel/        Chrome DevTools panel (MV3, plain JS)
server/            Hono server: /incidents /analyze /issue /fix /fix/apply /fix/revert /fix/pr /notify
supabase/          optional incident-history table migration (not enabled in the demo)
docs/              event brief, judging rubric, team plan, handoff, slides
```

Issues and PRs created by the demo land in the public mirror
[isaiyahe/repro-demo-shop](https://github.com/isaiyahe/repro-demo-shop).

## Privacy and guardrails

- Never sent anywhere: cookies, Authorization headers, password values, page HTML.
  Sensitive fields are `[REDACTED]` at capture; the server sanitizes again.
- The model returns structured output only (Zod-validated), retried once, then a
  deterministic fallback.
- The fix agent returns one exact snippet replacement in one allowlisted file. The
  server rebuilds the diff, enforces the path allowlist and a 60-line cap, refuses
  to apply if the file changed, and reverts on a failed re-verify.
- A PR is only opened when replay said `reproduced` before and `not_reproduced` after.
- Secrets stay in `server/.env`. `.env.example` lists what's needed.

## What was built during the event

Everything under `apps/`, `packages/`, `server/`, and `supabase/`, and all tests.
Before the 11:00 team-formation slot the repo contained only documentation
(`docs/event/`, this README's predecessor, `LICENSE`, `.gitignore`). The git
history is the audit trail: the first code commit is timestamped after 1:00 pm.
Libraries used as-is: WXT was planned and dropped for a plain MV3 panel, plus
`@openai/agents`, `hono`, `octokit`, `zod`, `express`, `playwright`, `diff`.

## What's next

- Incident history in Supabase (migration written, off for the demo).
- Sensor snippet as an npm package for any app; incidents from real users
  appear in the developer's panel with replay on their local build.
- Richer replay (navigation, scroll, timing) and cross-tab capture.

## License

MIT. See [LICENSE](LICENSE). Stack notes and the rubric are in [`docs/`](docs/).
