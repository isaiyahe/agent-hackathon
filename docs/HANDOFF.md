# REPRO — Session Handoff

For a fresh Claude session (any model) picking up this project. Read this,
then `TEAM_PLAN.md`, then `REPRO_BUILD.md`. Do not read the git history to
reconstruct state; this file is the state.

## The situation

- One-day hackathon. **Hard stop 3:30 pm local. Video at 3:00. Feature freeze 2:40.**
- Team: Isaiyah (backend, directs the AI session), his brother (frontend /
  Chrome extension), Aaliyah and one more non-technical teammate (submission,
  docs, video, portal). Ownership by directory is in `TEAM_PLAN.md`.
- Product: REPRO, a Chrome DevTools agent that witnesses a web failure,
  reconstructs steps, verifies by replay, files a GitHub issue, and (stretch)
  proposes a fix that the same replay verifies, then opens a PR.

## What is built and verified (all on `main`)

| Piece | Where | State |
|---|---|---|
| Contract: Incident, IncidentAnalysis (+ severity/impact), ReplayOutcome | `packages/core/schemas.ts` | done |
| Pure verifier + endpoint/error normalization | `packages/core/verify.ts` | done, tested |
| Sanitizer (mask sensitive inputs, strip credential params, drop secret headers, truncate) | `packages/core/sanitize.ts` | done, tested, applied server-side on every route |
| Fixture incident the panel renders first | `packages/core/fixtures/incident.json` | done |
| Demo shop with seeded guest-checkout 500 | `apps/demo/` (Express, `node --watch`, port 3000) | done |
| In-app sensor script tag | `apps/demo/public/repro.js`, included in `index.html` | done, proven in Chromium |
| Chromium smoke test through the real bug | `apps/demo/smoke.mjs` (`npm run smoke`) | passing |
| Server (Hono, port 8787) | `server/src/index.ts` | running |
| `/analyze` OpenAI structured output, 15s timeout, 1 retry, deterministic fallback | `server/src/analyze.ts` | live, ~5s |
| `/issue` deterministic markdown, Octokit, markdown returned on failure | `server/src/github.ts` | live; created + closed issue #1 on the mirror |
| `/fix`, `/fix/apply`, `/fix/revert` one exact edit, allowlist + 60-line cap enforced in code | `server/src/fix.ts` | live; 500 → fix → 200 → revert → 500 proven |
| `/fix/pr` PR on the mirror only for a replay-verified fix | `server/src/pr.ts` | live; created + closed PR #2 |
| `/notify` Slack webhook / Telegram, per-channel result, never throws | `server/src/notify.ts` | tested; no channel configured yet |
| `/incidents` intake + list + get + strict PATCH; Supabase mirror optional | `server/src/incidents.ts` | live; Supabase table NOT created yet |
| Supabase migration | `supabase/migrations/0001_incidents.sql` | written, not run |

Tests: `cd packages/core && npx vitest run` (14) and `cd server && npx vitest run` (48). All pass.

## What is NOT built

- **The Chrome extension (`apps/extension/`).** Brother's. Status unknown to
  the AI session as of 2:05 pm. This is the only risk to the demo. If it is
  not posting captured incidents by 2:15, the panel should list from
  `GET /incidents` (fed by `repro.js`) and Verify replays the stored actions.
- Panel UI for Fix / PR / Notify (gated on the extension existing).
- Supabase table (paste the migration into the SQL editor to enable; the
  server already inserts and logs a warning while the table is missing).

## Secrets and external things

- `server/.env` (gitignored) holds the OpenAI key, the GitHub token (from the
  user's `gh` login, OAuth token with `repo` scope), `GITHUB_REPO`, and the
  Supabase URL + secret key. **Never commit it. Never paste keys into chat.**
  Several keys were pasted into the AI chat during the build; rotate them
  after the event.
- Issues and PRs go to **https://github.com/isaiyahe/repro-demo-shop**, a
  public mirror of `apps/demo` (pushed via `git subtree split`). Issue #1
  and PR #2 there are closed test artifacts.
- `gh` CLI is 2.4.0 (old): no `gh auth token`; read the token from
  `~/.config/gh/hosts.yml` if needed.
- Slack/Telegram: set `SLACK_WEBHOOK_URL` or `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` in `server/.env` and restart the server.

## Running things

```bash
cd apps/demo && npm run dev        # http://localhost:3000/checkout
cd server && npm run dev           # http://localhost:8787  (--watch reloads code, NOT .env)
cd apps/demo && npm run smoke      # real Chromium through the bug → asserts intake
```

**Never `git checkout` the demo server file to restore the bug.** That replaces
the inode and `node --watch` silently stops restarting, so later fixes are
"rejected" by replay even when correct. Restore it by writing in place
(`git show HEAD:apps/demo/server/index.js > apps/demo/server/index.js`) or use
`POST /fix/revert`. If in doubt, restart the demo app.

Restart the server after editing `.env`. Kill stale servers with
`pgrep -f 'strip-types src/index.t[s]' | xargs -r kill` (a plain `pkill -f`
matches its own shell and dies first).

## Conventions and gotchas

- Everyone commits to `main`, small commits, `git pull --rebase` before push.
  No workspaces; each of `apps/demo`, `apps/extension`, `server`,
  `packages/core` has its own `package.json`. Import core by relative path
  **with the `.ts` extension** (Node's type stripping requires it; Vitest
  does not, so tests can pass while the server crashes).
- Core and server each resolve their own `zod` copy, so `instanceof ZodError`
  fails across them. Check `err.name === "ZodError"` instead.
- Before every commit, grep the staged diff for the three key prefixes
  (OpenAI project key, GitHub OAuth token, Supabase secret key). It must be
  empty. Do not use real-looking key prefixes in test fixtures.
- The model never decides whether a bug reproduced or a fix worked; the
  replay verifier does. Keep it that way in every new feature.
- Commit trailer used so far:
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` plus a
  `Claude-Session:` line. A new session uses its own attribution.

## Immediate next steps (in order)

1. Get the brother's extension status. Integrate or fall back to the
   incidents list. Decide by 2:15.
2. If a Slack webhook arrives, put it in `.env`, restart, and hit `/notify`
   once so the video can show a real ping.
3. 2:30: run `npm run smoke`, run the full curl chain (analyze → issue →
   fix → apply → pr → revert), close any test issue/PR on the mirror.
4. 2:40 freeze. 3:00 video (script in `docs/video-script.md` if the
   submission pair wrote it). 3:15 README rewrite (the "Run it" section in
   `TEAM_PLAN.md` is the source). Move `REPRO_Demo_App.pptx` and the
   uploaded file from the repo root into `docs/`.
5. Confirm the repo is public and a `git log -p` grep for the three key
   prefixes is empty.
