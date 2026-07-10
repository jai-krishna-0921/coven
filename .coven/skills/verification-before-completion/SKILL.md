---
name: verification-before-completion
description: Use when about to claim work is complete, fixed, or passing — before committing, before reporting, before creating PRs.
---

# Verification before completion

## Iron Law

```
EVIDENCE BEFORE ASSERTIONS. ALWAYS.
```

Violating the letter of the rules is violating the spirit of the rules.

No "done", "fixed", "passing", "works now" without having run the verification command in
THIS state of the code and read its output. The rule applies to paraphrases and synonyms —
"should be good now", "that takes care of it", a checked todo box, a ✅ — ANY communication
suggesting completion counts.

## The Gate Function

```
BEFORE claiming anything:
  1. IDENTIFY the claim you're about to make.
  2. RUN the command that would prove it (test suite, typecheck, build,
     the actual CLI invocation, the actual curl).
  3. READ the output — actually read it; a green exit code over a skipped
     suite is not a pass.
  4. VERIFY: does the output actually support the claim?
     IF YES: state the claim WITH the evidence (command + relevant output).
     IF NO:  state the ACTUAL status with the evidence — "2 of 14 tests
             failing, output below" — never soften it, never round it up
             to "mostly working".
  5. ONLY THEN communicate.

Skip any step = lying, not verifying.
```

## Claim → evidence

| Claim | Requires | Not sufficient |
|---|---|---|
| "Tests pass" | Full suite run NOW, output read, counts seen | Ran earlier; ran only the new test |
| "It compiles / typechecks" | `tsc --noEmit` / `bun build` output, zero errors | Editor shows no red squiggles |
| "The bug is fixed" | Original repro behaves correctly AND regression test passes | Code changed, assumed fixed |
| "Regression test works" | Red-green verified (pattern below) | Test passes once |
| "Feature works" | The actual command a user would run, run by you, output shown | Unit tests around the feature |
| "Requirements met" | Line-by-line checklist against the plan/spec | Tests passing |
| "TUI renders correctly" | Actually launch coven and drive the flow | Unit tests on the renderer |
| "Committed/pushed" | `git log -1` / `git status` output | Ran the git command without reading output |
| "Agent/subagent completed X" | VCS diff shows the changes; verify independently | Agent reports "success" |

## Regression-test red-green pattern

A regression test that has only ever passed proves nothing — it might pass for any code.
Prove it can detect the bug:

```
Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore fix → Run (pass)
```

If it doesn't fail on the reverted code, it isn't guarding the bug. Fix the test.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The change is trivial, it obviously works" | Trivial changes break builds daily. 30 seconds of running beats an apology. |
| "I ran it before my last small edit" | Then you verified a different program. |
| "The subagent said it passes" | Subagent reports are unverified claims. Run it. |
| "Should work now" | RUN the verification. |
| "Just this once" | No exceptions. |
| "Partial check is enough" | Partial proves nothing about the part you skipped. |
| "Different words, so the rule doesn't apply" | Spirit over letter. Any completion-shaped message needs evidence. |

## Red flags — including the emotional ones

- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", "✅").
- Tired and wanting the work to be over.
- Relief that the diff "looks right".
- About to commit "so the progress isn't lost" before the suite ran.
- ANY wording implying success without having run verification — paraphrases count.

All of these mean: stop, run the Gate Function, and let the output speak.
