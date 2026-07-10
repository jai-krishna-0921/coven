# Root-cause tracing

Technique for Phase 1 of systematic-debugging: trace backward from the symptom, up the
call chain, until you reach the original trigger. The symptom is where the pain shows; the
root cause is where the wrong value was born. They are almost never in the same function.

## The backward-trace method

Ask "who gave me this value?" repeatedly until the answer is "nobody — it was created
wrong right here." Each hop is one question.

Worked trace — a real shape of bug in a Bun test suite. Symptom: `git init` ran inside the
source repo and polluted the working tree.

```
Symptom:  .git directory appears in src/ during tests
   ↑ who ran git init there?        → session bootstrap ran `git init ${projectDir}`
   ↑ why was projectDir "src/"?     → it was "" and resolved relative to cwd
   ↑ who passed projectDir = ""?    → Session.create(context.tempDir) received undefined
   ↑ why was context.tempDir undefined? → the test read context.tempDir at module top level,
                                          BEFORE beforeEach assigned it
Root cause: test accessed fixture state before setup ran.
```

Five hops, five questions. Fixing hop 1 (delete the stray `.git`) or hop 2 (guard against
empty `projectDir`) leaves the real bug alive. The fix belongs at hop 5 — and THEN guards
at the intermediate hops as defense-in-depth (see `defense-in-depth.md`).

## Instrumentation: capture the stack BEFORE the dangerous operation

When you can see the bad effect but not the caller, log a stack trace at the choke point
— before the operation executes, not in the error handler after it fails:

```typescript
// Temporarily, at the dangerous operation:
async function gitInit(dir: string): Promise<void> {
  console.error(`[trace] gitInit dir=${JSON.stringify(dir)} cwd=${process.cwd()}`);
  console.error(`[trace] NODE_ENV=${process.env["NODE_ENV"]} TMPDIR=${process.env["TMPDIR"]}`);
  console.error(new Error("who called gitInit?").stack);
  // ...actual operation
}
```

Three things in one shot: the argument as it ACTUALLY arrived (JSON.stringify exposes
`""` vs `undefined`), the environment the operation will act in, and the full call chain
that led here. One run usually collapses hours of guessing into one grep.

## Use console.error in tests — the logger may be suppressed

Test runners and Coven's own logger commonly swallow or redirect `log.*` output during
tests. `console.error` writes to stderr, which `bun test` passes through. Instrument with
`console.error`, run once, then grep:

```bash
~/.bun/bin/bun test 2>&1 | grep '\[trace\]'
```

Remove all `[trace]` lines before committing — a tag makes them greppable for cleanup too.

## Bisection recipe for test pollution

Symptom: a test fails in the full suite but passes alone. Some EARLIER test is leaking
state (env vars, cwd, singletons, files). Don't read all the tests — bisect:

```bash
#!/usr/bin/env bash
# find-polluter.sh — run each test file, then the victim; stop at the first polluter.
# Usage: ./find-polluter.sh test/victim.test.ts
set -u
VICTIM="$1"
for f in test/*.test.ts; do
  [ "$f" = "$VICTIM" ] && continue
  echo "=== candidate: $f"
  if ! ~/.bun/bin/bun test "$f" "$VICTIM" >/dev/null 2>&1; then
    echo ">>> POLLUTER FOUND: $f (running it before $VICTIM makes it fail)"
    exit 1
  fi
done
echo "no single-file polluter; try pairs or shared setup files"
```

Once found, apply the backward-trace method INSIDE the polluter: what state does it write
that it never restores? Fix the leak at its source (restore in `afterEach`), don't make
the victim tolerant of pollution.

## The principle

```
symptom → trace backward → original trigger → fix THERE
                                         ↓
                            NEVER fix just the symptom
```

A symptom-level fix (delete the stray file, add a null-check where it crashed) makes THIS
failure disappear while the wrong value keeps flowing. Fix at the source, then add
defense-in-depth at the layers in between (`defense-in-depth.md`), then write the
regression test (REQUIRED SUB-SKILL: test-driven-development).
