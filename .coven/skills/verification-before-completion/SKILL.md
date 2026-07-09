---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing — before committing, before reporting, before creating PRs.
---

# Verification before completion

## Iron Law

EVIDENCE BEFORE ASSERTIONS. ALWAYS.

No "done", "fixed", "passing", "works now" without having run the verification command in
THIS state of the code and read its output.

## Protocol

1. Identify the claim you're about to make.
2. Identify the command that would prove it (test suite, typecheck, build, the actual CLI
   invocation, the actual curl).
3. Run it. Read the output — actually read it; a green exit code with a skipped suite is
   not a pass.
4. Only then state the claim, WITH the evidence: command + relevant output summary.

## Claim → minimum evidence

| Claim | Minimum evidence |
|---|---|
| "Tests pass" | Full suite run output, counts seen |
| "It compiles / typechecks" | `tsc --noEmit` / `bun build` output |
| "The bug is fixed" | The original repro now behaving correctly, AND the regression test passing |
| "Feature works" | The actual command a user would run, run by you, output shown |
| "Committed/pushed" | `git log -1` / `git status` output |

## Rationalizations

| Excuse | Reality |
|---|---|
| "The change is trivial, it obviously works" | Trivial changes break builds daily. 30 seconds of running beats an apology. |
| "I ran it before my last small edit" | Then you verified a different program. |
| "The subagent said it passes" | Subagent reports are unverified claims. Run it. |
