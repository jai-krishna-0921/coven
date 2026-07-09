---
name: systematic-debugging
description: Use when anything is failing — test failure, crash, wrong output, flaky behavior — before attempting any fix.
---

# Systematic debugging

## Iron Law

NO FIXES WITHOUT ROOT-CAUSE INVESTIGATION FIRST.

## Four phases — do not skip ahead

### 1. Root-cause investigation
- Read the ENTIRE error output, not the first line.
- Reproduce deterministically. A bug you can't reproduce isn't understood.
- `git log -p` recent changes — most bugs are recent.
- Multi-layer systems: add diagnostic output at every component boundary; find which
  boundary the data crosses correctly and which it doesn't.
- Trace backward from the symptom to the source.

### 2. Pattern analysis
- Find a working example of the same pattern in this codebase or the reference material.
- Read it COMPLETELY, then list every difference between working and broken.

### 3. Hypothesis & test
- State ONE hypothesis out loud. Make the smallest change that tests it.
- Verify the result before doing anything else. Keep a falsified-hypothesis log.

### 4. Implementation
- Write a failing test that captures the bug. Single fix. Full suite green.

## Stop rule

**Three failed fixes → STOP.** That is not three unlucky hypotheses; that is a wrong
architecture or a wrong mental model. Escalate the architectural question instead of
attempting fix #4.

## Signals you're doing it wrong

"Let me just try…", stacking a second fix on an unverified first fix, changing two things
at once, blaming the framework/runtime before checking your own code, re-running the same
command hoping for a different result.
