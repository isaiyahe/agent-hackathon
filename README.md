# agent-hackathon

Team repo for a one-day global agent hackathon.

**Team:** [@isaiyahe](https://github.com/isaiyahe) · [@jeremiyahe](https://github.com/jeremiyahe)

> **Project title, description, and demo go here on build day.**

---

## The challenge

> Build an agent for a place people already work, talk, or live, then make it
> meaningfully more useful because of that context.

Full brief, rubric, schedule, and prizes: **[`docs/event/`](docs/event/)**

| | |
|---|---|
| [The challenge & submission rules](docs/event/challenge.md) | What's being asked and what must be handed in |
| [Schedule](docs/event/schedule.md) | 4h15m of build time, with checkpoints |
| [Judging criteria](docs/event/judging-criteria.md) | Four criteria, full 1–5 rubric |
| [Prizes](docs/event/prizes.md) | Global placings plus two sponsor categories |
| [Submission checklist](docs/event/submission-checklist.md) | The five required deliverables |

## Build eligibility — read before committing code

The rules require the submitted project and **its core functionality** to be
built during the official event window. Templates, libraries, and starter code
are explicitly allowed; a pre-existing project is not.

**Everything in this repo before build day is documentation only** — this
README, the `docs/event/` folder, `.gitignore`, and `LICENSE`. No agent logic,
no framework skeleton, no dependencies. The git history is the audit trail:
the first code commit should be timestamped after the event's team-formation
slot.

When the project is done, add a short section here saying what was built during
the event. The rules say teams should be prepared to explain this.

## Stack

Undecided until build day — the portal publishes a shared starter repository
and sponsor resources beforehand, and we should see those first.

Leaning toward **CopilotKit + OpenAI + Exa**: CopilotKit embeds agents directly
into an existing app's UI, which lines up with the "agent in a place people
already work" framing rather than bolting a sponsor on for its own sake, and it
carries its own prize category. Confirm what **Ambiguous AI** provides on the
day — there's a prize for it, but we don't yet know what the tooling is.

## Getting set up on build day

```bash
git clone https://github.com/isaiyahe/agent-hackathon.git
cd agent-hackathon
```

Then decide the stack, scaffold it, and commit — in that order, in the repo,
where the history shows it.

## License

MIT — see [LICENSE](LICENSE). Replace the copyright line with your legal names
if you want it to be strictly correct.
