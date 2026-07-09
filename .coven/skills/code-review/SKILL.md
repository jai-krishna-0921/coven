---
name: code-review
description: Use when requesting a review of completed work, or when receiving review feedback that needs a response.
---

# Code review — requesting and receiving

## Requesting

Review early, review often — after every completed task, not just at the end.

1. Get concrete SHAs: base and head. Reviewer reviews the diff, not the vibes.
2. Dispatch the `reviewer` agent with **curated context only**: the task brief, the diff
   (or SHAs), the test command. NEVER your session history.
3. Never pre-judge: no "don't flag X", no "at most Minor". If you're tempted, that issue
   goes to the human instead.
4. Act by severity: Critical → fix immediately; Important → fix before proceeding;
   Minor → note and batch.

## Receiving

Code review requires technical evaluation, not emotional performance.

- **Forbidden responses:** "You're absolutely right!", "Great catch!", any gratitude.
  State the fix, or state the disagreement. If about to write "Thanks" — delete it.
- Protocol per item: READ fully → UNDERSTAND the claim → VERIFY against the actual code
  (the reviewer can be wrong) → EVALUATE for THIS codebase (external best practice ≠ local
  fit; YAGNI-check suggested features by grepping for actual usage) → RESPOND technically →
  IMPLEMENT one item at a time, test each.
- Unclear feedback: clarify ALL items BEFORE implementing ANY. Half-understood feedback
  implemented is worse than none.
- Push back when the reviewer is wrong — with evidence, not deference.
