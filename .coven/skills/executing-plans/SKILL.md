---
name: executing-plans
description: Use when a written plan exists and needs to be executed inline (without per-task subagents).
---

# Executing plans

## Iron Law

```
THE PLAN IS THE CONTRACT. EXECUTE AS WRITTEN, OR STOP AND RENEGOTIATE — NEVER QUIETLY DEVIATE.
```

Violating the letter is violating the spirit of the rules.

## Method

1. **Load** the plan file. Re-read the header: Goal, Global Constraints. Constraints apply
   to every task even when a task doesn't restate them.
2. **Read the ledger first.** If `docs/plans/<plan>.progress.md` exists, resume at the
   first task NOT marked complete. **Never re-execute a task the ledger marks done** —
   re-dispatching completed work is the single most expensive failure in plan execution.
3. **Review critically** before executing: type-check the Interfaces chain in your head;
   if a task is ambiguous or contradicts the spec, STOP and resolve — don't improvise.
4. **Check the branch.** Starting implementation on main/master requires explicit consent.
   REQUIRED SUB-SKILL: using-git-worktrees — set up isolation before task 1, not after.
5. **Execute in order**, one task at a time, exactly as written:
   - Each task's steps are TDD steps. REQUIRED SUB-SKILL: test-driven-development —
     follow it to the letter, including watching each test fail first.
   - Compare each run's output to the step's Expected output. A mismatch is a stop, not
     a shrug.
   - Commit at each task boundary with the message the plan specifies.
   - Append one ledger line per completed task (format below).
6. **After the final task**, run the handoff sequence (below) in order.

## Ledger format

One line per completed task in `docs/plans/<plan>.progress.md`:

```
Task 3: complete (commits a1b2c3d..e4f5a6b, suite green)
Task 4: complete (commits e4f5a6b..9c8d7e6, suite green)
```

After a context compaction, the ledger plus `git log` is the truth — trust them over your
own recollection. At skill start, read the ledger and resume at the first task not marked
complete.

## When to stop and ask

STOP and ask your human partner — do not guess — when:

- A blocker appears that the plan didn't anticipate.
- An instruction is unclear or two steps contradict each other.
- Verification fails and the failure isn't resolved by one obvious fix (then:
  REQUIRED SUB-SKILL: systematic-debugging).
- A task turns out much bigger than planned — split it and write the split back into the
  plan file first.
- The plan looks wrong. "The plan is wrong here, I'll just quietly do it right" is a
  forbidden move: deviations get agreed with your partner, then written back into the
  plan file, THEN executed.

**When to revisit earlier steps:** if your partner updates the plan mid-execution,
re-review the whole remaining plan before continuing — a change to Task 5 can invalidate
the Interfaces that Task 7 consumes.

## Final handoff — in this exact order

1. Run the FULL suite (not just the last task's tests).
2. verification-before-completion — evidence for every claim you're about to make.
3. code-review — request a review of base..HEAD.
4. finishing-a-branch — merge/PR/keep/discard decision with your partner.

## Rationalization table

| You're thinking | Reality |
|---|---|
| "These three tasks are tiny, I'll batch one commit" | One task, one commit — the ledger and bisect depend on it. |
| "The step's verify command is redundant" | The verify step IS the step. Skipping it converts the plan to hope. |
| "I remember where I was, no need to check the ledger" | Post-compaction memory is reconstruction, not recall. Read the ledger. |
| "I'll reorder tasks, this order is more efficient" | Later tasks consume earlier tasks' Produces. Order is load-bearing. |

## Red flags — stop immediately if you notice

- Skipping a verification step because the previous three passed.
- Reordering tasks for convenience.
- Starting on main/master without explicit consent.
- "The plan is wrong here, I'll just quietly do it right."
- Marking a ledger line complete before the commit exists.

All of these mean: stop, re-read the plan, and follow it or renegotiate it.

## Rules

- No batching commits "to save time" — one task, one commit.
- A task that turns out bigger than planned is split and written back into the plan, not
  powered through.
- Prefer subagent-driven execution (dispatch `builder` + `reviewer` per task — see
  dispatching-parallel-agents for the dispatch mechanics) when tasks are independent;
  this skill is the inline fallback.
