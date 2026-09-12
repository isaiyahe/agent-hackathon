# Judging Criteria

Projects are evaluated **globally after submissions close**. Judges score every
project from **1 to 5 across each criterion**.

---

## 1. Core Requirements & Functionality

**What they're looking for:** Does the project deliver a working agent inside a
place where people already work, talk, or live? Does the core workflow function
end to end?

| Score | Description |
|---|---|
| 1 | The project does not run or does not demonstrate a functional agent. |
| 2 | Parts of the project run, but the core workflow or environment integration is incomplete. |
| 3 | A basic end-to-end agent works in the intended environment, with limitations or bugs. |
| 4 | The project works reliably and demonstrates a complete agent experience with only minor issues. |
| 5 | The project is robust, reliable, and fully functional within its intended environment. |

---

## 2. Innovation & Theme Alignment

**What they're looking for:** Does the project explore a compelling new place or
interaction for agents? Does the environment materially improve what the agent
can do?

| Score | Description |
|---|---|
| 1 | The project is essentially a generic chatbot or automation; the selected environment is irrelevant. |
| 2 | The agent appears in an eligible environment, but the environment mostly serves as a wrapper. |
| 3 | The project clearly addresses the theme, and its environment adds meaningful value. |
| 4 | The environment shapes the core workflow and enables an original agent experience. |
| 5 | The project reveals a surprising new agent pattern whose central value could not be reproduced in a standalone chatbox. |

---

## 3. Technical Execution & Integration

**What they're looking for:** Consider the code, architecture, reliability, tool
use, data handling, and depth of integration with the selected environment.

| Score | Description |
|---|---|
| 1 | Little or no technical execution is evident; the submission is primarily conceptual or mocked. |
| 2 | The implementation is basic, unstable, or relies on superficial integrations. |
| 3 | The project demonstrates solid technical execution and working integrations, with some rough edges. |
| 4 | The project is well engineered, reliable, and integrates its tools, data, and environment effectively. |
| 5 | The project demonstrates exceptional engineering, including robust orchestration, thoughtful failure handling, and a deeply integrated architecture. |

---

## 4. Usefulness & Agentic Experience

**What they're looking for:** Does the project create clear value for its
intended users? Is the agent intuitive, effective, and appropriate for the
environment in which it operates?

| Score | Description |
|---|---|
| 1 | The use case is unclear, and the agent provides little meaningful value or interaction. |
| 2 | The project addresses a recognizable use case, but the agent's contribution is limited or largely resembles basic prompt and response. |
| 3 | The project is useful, the interaction is understandable, and the agent performs meaningful actions with reasonable user control. |
| 4 | The project solves a clear problem, and the agent feels native to its environment while creating a strong interaction between people and AI. |
| 5 | The project unlocks substantial value through an agent experience designed specifically for its environment, using context intelligently while remaining clear and controllable. |

---

## Reading the rubric

Three of the four criteria reward the same thing from different angles: **the
environment has to be load-bearing.** The gap between a 3 and a 5 on criterion 2
is explicitly "could this be reproduced in a standalone chatbox?" — if the answer
is yes, the ceiling is a 3 no matter how good the code is.

Criterion 1 is the one you lose by accident. A project that doesn't run scores a
1 regardless of ambition. Protect the demo path above all else.

The 5 on criterion 3 names **"thoughtful failure handling"** specifically — what
the agent does when a tool call fails, when the model returns garbage, when the
environment's API is down. Cheap to add, rarely done in a day, disproportionately
rewarded.
