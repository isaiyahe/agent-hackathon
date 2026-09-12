# Submission Checklist

All five items are required. Missing one is the cheapest possible way to lose.

- [ ] **1. Project title**
- [ ] **2. Written description**
- [ ] **3. Public GitHub repository** — confirm it is actually public before submitting
- [ ] **4. Two-minute demonstration video** — hard limit, record it by 3:00 p.m.
- [ ] **5. Social media post** about the project, **tagging the event partners**

Submitted in the portal by the posted deadline.

## Pre-submission sweep

- [ ] Repo is public and the default branch has the final code
- [ ] `README.md` explains what it is, how to run it, and what environment it lives in
- [ ] **No API keys or secrets committed** — check `git log -p` for anything in an early commit, not just the current tree
- [ ] `.env.example` present so judges can see what config is needed
- [ ] A judge who clones it cold can tell what to do within 30 seconds
- [ ] README states plainly which parts were built during the event (the rules say be ready to explain this)

## Demo video notes

Two minutes is short. A structure that fits:

| Seconds | Content |
|---|---|
| 0–15 | What it is and what environment it lives in |
| 15–30 | The problem, stated concretely |
| 30–100 | **Live demo of the core interaction.** This is the video. |
| 100–120 | Why the environment makes it work, and what's next |

Do not spend the first 40 seconds on architecture slides. Judges are scoring
whether it *works*.
