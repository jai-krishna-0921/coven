---
name: writing-plans
description: Use when an approved design needs to become an implementation plan, before any implementation starts.
---

# Writing plans

## Iron Law

```
NO PLACEHOLDERS. EVERY TASK MUST BE EXECUTABLE BY A FRESH CONTEXT WITH ZERO HISTORY.
```

Violating the letter is violating the spirit of the rules.

Write for an enthusiastic junior engineer with poor taste, no context, and an aversion to
testing. Everything explicit; nothing left to inference. The implementer of Task 4 has
never seen Tasks 1–3, your chat history, or the spec discussion. Whatever isn't in the
task doesn't exist.

## Plan header (mandatory) — with real content, not field names

```markdown
# Plan: Slash-command registry

> **For agentic workers:** execute with executing-plans task-by-task; steps use `- [ ]`
> checkboxes for tracking.

Goal: Users can define custom commands as .coven/commands/<name>.md and invoke them as /<name>.
Architecture: CommandRegistry loads builtin + markdown commands at session start; TUI
  dispatches lines starting with "/" to the registry before the model sees them.
Tech Stack: TypeScript strict, Bun runtime, bun:test, node:fs only (no Bun.* APIs).
Global Constraints: ← copied VERBATIM from the spec; every task inherits these
  - Named exports only; no `any` (unknown + narrowing).
  - Errors extend NamedError from src/util/error.ts.
  - No new npm dependencies.
```

The Global Constraints block is copied verbatim from the spec — every task's requirements
implicitly include this section even when the task doesn't restate it.

## Task format

```
## Task N: <outcome>
Files: exact paths (create/modify, with anchors)
Interfaces:
  Consumes: <names + exact types from earlier tasks>
  Produces: <names + exact types for later tasks>
Steps (each 2–5 min):
  1. Write failing test <file>: asserts <specific behavior> — with the actual test code
  2. Run <command>, watch it fail — with the expected failure text
  3. Minimal implementation — with the actual code or an unambiguous sketch
  4. Run <command>, watch it pass
  5. Commit "<message>"
```

## A fully worked task (this is the bar — steps have CONTENT)

```markdown
## Task 2: parseCommandRef splits "/name arg text" into name + args

Files: create src/command/parse.ts; create test/command-parse.test.ts
Interfaces:
  Consumes: nothing (leaf utility)
  Produces: parseCommandRef(line: string): { name: string; args: string } | undefined
Steps:
- [ ] 1. Write the failing test in test/command-parse.test.ts:

    import { describe, expect, test } from "bun:test";
    import { parseCommandRef } from "../src/command/parse.ts";

    describe("parseCommandRef", () => {
      test("splits name and args", () => {
        expect(parseCommandRef("/compact now please")).toEqual({ name: "compact", args: "now please" });
      });
      test("non-command lines return undefined", () => {
        expect(parseCommandRef("hello /world")).toBeUndefined();
      });
    });

- [ ] 2. Run: ~/.bun/bin/bun test test/command-parse.test.ts
       Expected: FAIL — "Cannot find module '../src/command/parse.ts'"
- [ ] 3. Implement src/command/parse.ts:

    export function parseCommandRef(line: string): { name: string; args: string } | undefined {
      if (!line.startsWith("/")) return undefined;
      const space = line.indexOf(" ");
      if (space === -1) return { name: line.slice(1), args: "" };
      return { name: line.slice(1, space), args: line.slice(space + 1) };
    }

- [ ] 4. Run: ~/.bun/bin/bun test test/command-parse.test.ts
       Expected: 2 pass, 0 fail
- [ ] 5. Commit "feat(command): parseCommandRef splits slash commands"
```

## Named plan failures — any of these fails self-review

- "TBD", "handle errors appropriately", "handle edge cases".
- "Write tests for the above" without the actual test code.
- "Similar to Task N" — repeat the code; the engineer may be reading tasks out of order.
- References to types, functions, or methods not defined in any task.
- A step with no run command, or a run command with no expected output.

## Task right-sizing

A task is the smallest unit that carries its own test cycle and is worth a fresh
reviewer's gate. Split only where a reviewer could reject one task while approving its
neighbor. A task that is "just wiring" with nothing to test belongs merged into the task
that makes it testable.

## Self-review — three named passes before offering the plan

1. **Coverage pass:** every spec requirement points at a task. List the gaps; add tasks.
2. **Placeholder pass:** scan for the named plan failures above.
3. **Type-consistency pass:** walk every Consumes/Produces pair across tasks.
   `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug — the Interfaces
   block is the ONLY way isolated implementers learn their neighbors' names and types.

Before the human sees the plan, optionally dispatch a `reviewer` subagent with
`writing-plans/plan-reviewer.md` against it.

## Execution handoff — verbatim script

Save to `docs/plans/YYYY-MM-DD-<topic>.md`, then ask:

> Plan written to `docs/plans/<file>`. Two ways to execute it:
> 1. **Subagent-driven** — I dispatch a builder per task with a reviewer gate after each
>    (better isolation, survives compaction).
> 2. **Inline** — I execute it myself task-by-task with the executing-plans skill
>    (faster for small plans).
> Which do you want?

Wait for the answer. Do not start executing on your own.

## Rationalization table

| You're thinking | Reality |
|---|---|
| "The implementer is smart, they'll figure it out" | The implementer is a fresh context with zero history. Whatever isn't in the task doesn't exist. |
| "Writing the code in the plan is doing the work twice" | Plan-time code is cheap to fix; implementation-time confusion is expensive. |
| "I'll fill in Interfaces later" | Later is after two implementers invented incompatible names. |
| "This step is obvious, no expected output needed" | The expected output is how the implementer knows they're NOT on the happy path. |

## Red flags — phrases in your own head

- "The details will emerge during implementation"
- "Any reasonable engineer would…"
- "I'll reference the spec instead of restating"
- "One big task is simpler than five small ones"

All of these mean: stop and write the content into the task.
