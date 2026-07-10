---
name: code-review
description: Use when requesting a review of completed work, or when receiving review feedback that needs a response.
---

# Code review — requesting and receiving

## Iron Law

```
EVERY COMPLETED TASK GETS A REVIEW. EVERY REVIEW ITEM GETS A TECHNICAL RESPONSE — NEVER A PERFORMANCE.
```

Violating the letter of the rules is violating the spirit of the rules.

## Requesting

Review early, review often — after every completed task, not just at the end.

**When to request:** after each completed task · before any merge/PR · when stuck (a
reviewer sees what you're blind to) · after a complex bugfix.

1. **Get concrete SHAs: base and head.** The reviewer reviews the diff, not the vibes.
   **BASE-SHA trap:** record BASE before work starts (`git rev-parse HEAD` at task start)
   — never `HEAD~1`, which silently drops all but the last commit of a multi-commit task,
   and the reviewer approves a fraction of the change without knowing it.
2. Dispatch the `reviewer` agent with the prompt in `code-review/reviewer-prompt.md`,
   filling its placeholders: `DESCRIPTION`, `PLAN_OR_REQUIREMENTS`, `BASE_SHA`,
   `HEAD_SHA`. Curated context only — the task brief, the SHAs, the test command. NEVER
   your session history.
3. **Do Not Trust the Report.** The reviewer must treat your implementer report — and any
   subagent's — as unverified claims, including "kept it simple per YAGNI" and "all tests
   pass". Claims get checked against the diff and the suite, not taken on faith. (This
   rule is baked into `reviewer-prompt.md`; don't remove it to make reviews "faster".)
4. Never pre-judge: no "don't flag X", no "at most Minor". If you're tempted to write
   that, the issue you're hiding goes to the human instead.

### Severity → action

| Severity | Action |
|---|---|
| Critical | Fix immediately, before anything else |
| Important | Fix before proceeding to the next task |
| Minor | Note it; batch with the next natural commit |

## Receiving

Code review requires technical evaluation, not emotional performance.

- **Forbidden responses:** "You're absolutely right!", "Great catch!", any gratitude.
  State the fix, or state the disagreement. If about to write "Thanks" — delete it.
- Protocol per item: READ fully → UNDERSTAND the claim → VERIFY against the actual code
  (the reviewer can be wrong) → EVALUATE for THIS codebase (external best practice ≠ local
  fit; YAGNI-check suggested features by grepping for actual usage) → RESPOND technically →
  IMPLEMENT one item at a time, test each. Order the fixes: blocking → simple → complex.
- **Clarify ALL items BEFORE implementing ANY.** Verbatim example — reviewer says
  "Fix items 1–6", you understand 1, 2, 3, 6:
  - ❌ WRONG: implement 1, 2, 3, 6 now, ask about 4 and 5 later.
  - ✅ RIGHT: "Understand 1, 2, 3, 6. Need clarification on 4 and 5 before implementing."
  Items may be related — partial understanding = wrong implementation.
- Push back when the reviewer is wrong — with evidence, not deference: "Checked: this
  endpoint has no callers anywhere in src/ or test/. Remove it (YAGNI)?"

### Graceful correction — when YOUR pushback was wrong

State the correction factually and move on:

- ✅ "You were right — I checked `SessionStore.create` and it does throw on relative
  paths. Implementing the guard now."
- ❌ A long apology, or re-defending the original pushback.

## Common mistakes

| Mistake | Instead |
|---|---|
| Performative agreement ("Good point, will do!") | State the requirement or just act |
| Batch-fixing all items, then one test run | One item at a time, test each |
| Can't verify a claim, proceed anyway | State the limitation, ask for direction |
| Implementing the understood half of feedback | Clarify all items first |
| Softening a finding you dislike into "Minor" | Severity comes from impact, not comfort |
