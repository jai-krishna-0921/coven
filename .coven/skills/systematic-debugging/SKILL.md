---
name: systematic-debugging
description: Use when anything is failing — test failure, crash, wrong output, flaky behavior — before attempting any fix.
---

# Systematic debugging

## Iron Law

```
NO FIXES WITHOUT ROOT-CAUSE INVESTIGATION FIRST.
```

Violating the letter of the rules is violating the spirit of the rules.

Use this ESPECIALLY when you're under time pressure or have already tried multiple fixes —
that is exactly when guess-and-check thrashing starts. Systematic debugging is FASTER than
thrashing, not slower.

## Four phases — do not skip ahead

You MUST complete each phase before proceeding to the next.

### Phase 1 — Root-cause investigation

- Read the ENTIRE error output, not the first line. The real cause is often in frame 4.
- Reproduce deterministically. A bug you can't reproduce isn't understood.
- `git log -p` recent changes — most bugs are recent.
- Trace backward from the symptom to the source. See `root-cause-tracing.md` beside this
  file for the backward-trace method and stack-capture instrumentation.

**Multi-component systems — the evidence-gathering recipe.** When data crosses several
components, do NOT guess which one is broken. For EACH component boundary: log what
enters, log what exits, verify config/env propagation. Run ONCE to see where it breaks,
THEN investigate that component.

Concrete sketch for Coven's own pipeline (TUI input → session loop → provider request →
tool exec):

```typescript
// src/tui/input.ts — what left the TUI?
console.error(`[seam:tui] submitted: ${JSON.stringify(userText)}`);

// src/session/loop.ts (SessionEngine) — what entered the loop, what goes to the provider?
console.error(`[seam:loop] messages=${messages.length} last=${JSON.stringify(messages.at(-1))}`);
console.error(`[seam:loop] model=${model} tools=${tools.map((t) => t.name).join(",")}`);

// src/provider/anthropic.ts — what does the wire request actually contain?
console.error(`[seam:provider] request body: ${JSON.stringify(body).slice(0, 2000)}`);

// src/tool/registry.ts — what arguments did the tool ACTUALLY receive?
console.error(`[seam:tool] ${name} args=${JSON.stringify(args)} cwd=${process.cwd()}`);
```

Run the failing flow once, then read the seams in order. The bug lives between the last
seam that shows correct data and the first seam that shows wrong data. Now you know WHICH
component to investigate — and you skip investigating the other three.

### Phase 2 — Pattern analysis

- Find a working example of the same pattern in this codebase or the reference material.
- Read it COMPLETELY, then list every difference between working and broken.
- Don't dismiss differences as irrelevant before testing them — "that can't matter" is a
  hypothesis, not a fact.

### Phase 3 — Hypothesis & test

- State ONE hypothesis out loud: "I believe X because Y."
- Make the smallest change that tests it. One variable at a time.
- Verify the result before doing anything else. Keep a falsified-hypothesis log.

### Phase 4 — Implementation

1. Write a failing test that captures the bug. REQUIRED SUB-SKILL: test-driven-development
   — the failing test IS the reproduction, and its RED→GREEN cycle IS the confirmation.
2. Single fix, at the root cause — never just the symptom (see `root-cause-tracing.md`).
3. Consider hardening the surrounding layers so the whole class of bug becomes impossible
   — see `defense-in-depth.md`.
4. Full suite green. Then verification-before-completion before claiming the fix.

## Stop rule

**Three failed fixes → STOP.** That is not three unlucky hypotheses; that is a wrong
architecture or a wrong mental model. Escalate the architectural question to your human
partner instead of attempting fix #4.

## When process reveals no root cause

Sometimes a genuine environmental, timing, or external cause resists the four phases. If —
and only if — you have completed all four phases and the cause is truly outside your code:

1. Document exactly what you investigated and what you ruled out.
2. Implement handling, not hope: retry with backoff, a timeout, a clear error message.
3. Add logging at the relevant seams so the next occurrence carries evidence.

**But: 95% of "no root cause" cases are incomplete investigation.** Before taking this
exit, re-read Phase 1 and ask which boundary you never instrumented. Flaky async tests in
particular are almost never "just flaky" — see `condition-based-waiting.md`.

## Quick reference

| Phase | Key activities | Success criteria |
|---|---|---|
| 1. Root cause | Read full errors, reproduce, `git log -p`, instrument every boundary | You know WHAT breaks and WHY |
| 2. Pattern analysis | Find a working example, list every difference | You know what working looks like |
| 3. Hypothesis & test | One hypothesis, smallest test, falsified-hypothesis log | Hypothesis confirmed or cleanly falsified |
| 4. Implementation | Failing test first, single root-cause fix, full suite | Bug gone, test guards it, suite green |

## Rationalization table

| You're thinking | Reality |
|---|---|
| "Issue is simple, don't need process" | Simple issues have root causes too. The process is fast for simple bugs. |
| "Just try this first, then investigate" | The first fix sets the pattern. Thrashing starts with one guess. |
| "Emergency, no time for process" | Systematic debugging is FASTER than guess-and-check thrashing. |
| "Multiple fixes at once saves time" | Can't isolate what worked. Causes new bugs. |
| "One more fix attempt" (after 2+ failures) | 3+ failures = architectural problem. Question the pattern, don't fix again. |
| "I'll write the test after confirming the fix works" | Untested fixes don't stick. The failing test IS the confirmation. |

## Red flags — stop immediately if you notice

- "Let me just try…"
- Stacking a second fix on an unverified first fix.
- Changing two things at once.
- Blaming the framework/runtime before checking your own code.
- Re-running the same command hoping for a different result.
- Adding a sleep/timeout "to make it stable".
- Your human partner asks "Is that not happening?" or says "Stop guessing" — those are
  redirection cues, not small talk.

All of these mean: stop, return to Phase 1, and instrument the boundaries.

## Supporting techniques

- `root-cause-tracing.md` — backward-trace method, stack capture before dangerous
  operations, test-pollution bisection.
- `defense-in-depth.md` — layered validation after the root-cause fix.
- `condition-based-waiting.md` — replacing arbitrary sleeps with condition polling in
  async/TUI/session tests.
