---
name: writing-plans
description: Use when an approved design needs to become an implementation plan, before any implementation starts.
---

# Writing plans

Write for an enthusiastic junior engineer with poor taste, no context, and an aversion to
testing. Everything explicit; nothing left to inference.

## Plan header (mandatory)

```
Goal:
Architecture:
Tech Stack:
Global Constraints:   ← copied VERBATIM from the spec; every task inherits these
```

## Task format

```
## Task N: <outcome>
Files: exact paths (create/modify, with anchors)
Interfaces:
  Consumes: <names + exact types from earlier tasks>
  Produces: <names + exact types for later tasks>
Steps (each 2–5 min):
  1. Write failing test <file>: asserts <specific behavior>
  2. Run <command>, watch it fail
  3. Minimal implementation
  4. Run <command>, watch it pass
  5. Commit "<message>"
```

## Rules

- Task = smallest unit with its own test cycle, worth a fresh reviewer's gate.
- **No placeholders.** "TBD", "handle errors appropriately", "similar to Task N" are plan
  failures. Write the content.
- The Interfaces block is the only way isolated implementers learn neighbors' names/types.
  Type-check it mentally across every Consumes/Produces pair.
- Self-review: every spec requirement maps to a task; placeholder scan; interface
  consistency.
- Save to `docs/plans/YYYY-MM-DD-<topic>.md`. Offer two execution paths: subagent-driven
  (dispatch builder per task + reviewer after each) or inline (executing-plans skill).
