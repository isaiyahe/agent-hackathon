# Submission copy

## Title

REPRO

## One-liner

A debugging agent that witnessed the failure and can prove it happens again.

## Written description (portal)

REPRO is a debugging agent that lives inside Chrome DevTools. When a web app
fails, REPRO has already seen it: the clicks that led there, the request that
failed, the error that was thrown. It turns that evidence into reproduction
steps, a root-cause hypothesis, and a severity rating, then proves the bug by
replaying the same actions in the page. After the user approves, it files a
GitHub issue with the evidence.

Then it goes one step further. REPRO asks an implementer agent for the
smallest safe edit, shows the diff, and only after the user clicks Apply does
it write the change. It replays the same actions again. Only a replay that no
longer fails counts as fixed. A verified fix opens a pull request with the
before-and-after evidence for a human to merge, and the team gets a Slack
message with the severity, the impact, and the links.

The model never decides whether the bug reproduced or the fix worked. Replay
does. Capture, sanitization, signature matching, the edit allowlist, and every
approval gate are deterministic code. The model explains verified evidence; it
does not define it.

The browser is load-bearing. A chatbox can analyze an error you paste in; REPRO
watched it happen, can make it happen again, and can show it no longer does. A
one-line script tag brings the same capture to real users' sessions, so
production failures land in the developer's panel with the click trail
attached, and a management dashboard shows error rates and trend.

Built in one day. Stack: Chrome DevTools extension (Manifest V3), Hono server,
OpenAI structured outputs via the Agents SDK, Octokit, Zod, Supabase for
incident history, Playwright for the automated proof of the full loop.
Everything under apps/, packages/, server/, and supabase/ was written during
the event; the repo held only docs before team formation.

Repo: https://github.com/isaiyahe/agent-hackathon
Demo issues and PRs: https://github.com/isaiyahe/repro-demo-shop

## Social post (fill in the partner handles the event asks for)

Most coding agents wait for you to describe the bug. REPRO was there when it happened.

We built a DevTools agent that watches a web app fail, replays the clicks to prove it, files the issue, proposes a fix, replays again to prove the fix, and opens the PR. The model never decides if it's fixed. Replay does.

One day, one team of four, in Chrome DevTools.

https://github.com/isaiyahe/agent-hackathon

@OpenAI @Exa_AI @CopilotKit #agenthackathon

## Short version (if the field is small)

REPRO: a Chrome DevTools agent that witnesses a web failure, replays it to prove it, files the issue, proposes a fix, and proves the fix by replaying again. The model never decides what's fixed; replay does.
