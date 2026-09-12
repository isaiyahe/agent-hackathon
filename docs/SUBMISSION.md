# Submission copy

## Title

**REPRO — the debugging agent that lives in Chrome DevTools**

Fallback if the field is short: `REPRO`

---

## Written description (full — ~330 words)

Most coding agents wait for you to describe the bug. REPRO was there when it
happened.

REPRO is a debugging agent that lives inside **Chrome DevTools**. It sits in a
panel next to Elements and Network, watches the web app you are inspecting, and
when something fails it already has the evidence: the semantic trail of clicks
and inputs that led there, the request that returned 500, the runtime error.
From that it reconstructs reproduction steps, writes a hypothesis and a severity,
files a GitHub issue, proposes a one-file fix, opens a pull request, and pings
the team on Slack. A human approves every single step.

The part that makes it more than a summarizer is **replay**. Before REPRO claims
anything, it re-executes the recorded actions in the live inspected page and
compares the failure signature — endpoint, method, status, error — with a pure
function. It replays again after applying the proposed fix. A pull request is
only ever opened when replay said `reproduced` before and `not_reproduced` after.
**The model never decides whether a bug reproduced or a fix worked. Replay does.**

This is why the environment is load-bearing rather than decorative. A chatbox
cannot see the click trail, cannot re-run it against the running app, and cannot
tell a real fix from a plausible-sounding one. DevTools can, because it has the
page. The same contract works from two directions: the panel witnesses the
developer's own session, and a one-line script tag witnesses real users and posts
the identical `Incident` shape, so a production failure lands in the developer's
panel and replays on their local build.

Every hop has a failure state. The model call has a timeout, one retry, and a
deterministic fallback summary. A GitHub outage returns the issue markdown to
copy by hand. The fix agent may touch one allowlisted file, capped at 60 lines;
the server rebuilds the diff itself, refuses if the file drifted, and reverts
automatically when re-verification fails. Cookies, auth headers, passwords and
page HTML are redacted at capture and sanitized again server-side before anything
reaches OpenAI, GitHub, Slack, or Supabase.

---

## Written description (short — ~110 words, if the portal caps length)

Most coding agents wait for you to describe the bug. REPRO was there when it
happened.

REPRO is a debugging agent that lives in a **Chrome DevTools** panel. It watches
the app you are inspecting, captures the clicks and the failed request that led
to a failure, reconstructs the reproduction steps, then **proves the bug by
replaying it in the live page**. It files a GitHub issue, proposes a one-file
fix, replays again to prove the fix, opens a pull request, and notifies the team
with a severity. A human approves every action.

The model never decides whether a bug reproduced or a fix worked — replay does.
That check is only possible because the agent lives in the browser.

---

## One-line tagline

A debugging agent in Chrome DevTools that proves the bug by replaying it, and
proves the fix the same way.

---

## Built during the event

Everything under `apps/`, `packages/`, `server/`, and `supabase/`, plus all
tests — 8,200 lines. Before the 11:00 team-formation slot the repository held
only documentation, the licence, and ignore rules; the git history is the audit
trail, with the first code commit timestamped after 1:00 pm. Libraries used
as-is: `@openai/agents`, `hono`, `octokit`, `zod`, `express`, `playwright`,
`diff`.

## Team

- [@isaiyahe](https://github.com/isaiyahe) — backend, agent, shared contract
- [@JeremiyahE](https://github.com/JeremiyahE) — DevTools extension
- [@aaliyahescobedo13-svg](https://github.com/aaliyahescobedo13-svg) — slides, submission, video
- [@jibekry](https://github.com/jibekry) — submission, video, docs

## Links

- Repository: https://github.com/isaiyahe/agent-hackathon
- Issues and PRs opened by the demo: https://github.com/isaiyahe/repro-demo-shop
