---
name: executing-plans
description: Use when a written plan exists and needs to be executed inline (without per-task subagents).
---

# Executing plans

## Method

1. **Load** the plan file. Re-read the header: Goal, Global Constraints. Constraints apply
   to every task even when a task doesn't restate them.
2. **Review critically** before executing: type-check the Interfaces chain in your head;
   if a task is ambiguous or contradicts the spec, STOP and resolve — don't improvise.
3. **Execute in order**, one task at a time, exactly as written:
   - Each task's steps are TDD steps. Follow test-driven-development to the letter.
   - Commit at each task boundary with the message the plan specifies.
   - Track progress in a ledger (todo list or `docs/plans/<plan>.progress.md`) — after a
     context compaction, the ledger plus `git log` is the truth, not memory.
4. **When blocked**: report precisely what's blocking and what you tried. Do NOT guess, do
   NOT skip ahead to an easier task, do NOT quietly deviate from the plan. Plan deviations
   get agreed, then written back into the plan file.
5. **After the final task**: run the full suite, then use verification-before-completion,
   then code-review.

## Rules

- No batching commits "to save time" — one task, one commit.
- A task that turns out bigger than planned is split and written back into the plan, not
  powered through.
- Prefer subagent-driven execution (dispatch `builder` + `reviewer` per task) when tasks
  are independent; this skill is the inline fallback.
