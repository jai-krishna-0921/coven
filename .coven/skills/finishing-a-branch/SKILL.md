---
name: finishing-a-branch
description: Use when implementation on a branch is complete — tests written, code reviewed — and the branch needs integration: merge, PR, keep, or discard.
---

# Finishing a branch

## Iron Law

```
NO MERGE, NO PR, NO CLEANUP WITH A FAILING SUITE — AND NO INTEGRATION PATH CHOSEN FOR THE USER.
```

Violating the letter of the rules is violating the spirit of the rules.

## Step 1 — Verify tests (gate)

Run the FULL suite and read the output:

```bash
~/.bun/bin/bun test
```

**If anything fails: STOP.** Show the failures to your partner and say you cannot proceed
to merge/PR until they pass. Do not present the options below. Do not "merge now, fix on
main after". REQUIRED SUB-SKILL: systematic-debugging for the failures;
verification-before-completion for the claim that they're gone.

## Step 2 — Detect the environment

```bash
git rev-parse --git-dir; git rev-parse --git-common-dir
```

Outputs differ → you are in a linked **worktree** (cleanup will need `git worktree
remove`). Outputs match → normal **checkout** (cleanup is just branch deletion). Remember
which — Step 6 depends on it.

## Step 3 — Determine the base branch

The branch this work forked from — usually `main`. Check `git log --oneline
main..HEAD` (or the recorded base from the plan) to confirm the commits you're about to
integrate are the ones you think. If the base is ambiguous, ask; never guess a merge
target.

## Step 4 — Present exactly these 4 options (verbatim)

> Implementation complete: all tests pass, review is clean. What next?
>
> 1. **Merge back to `<base>` locally** — I merge, re-run tests on the merged result, then clean up the branch/worktree.
> 2. **Push and create a PR** — I push the branch and open a PR against `<base>`; the worktree stays for iteration.
> 3. **Keep the branch as-is** — nothing merged, nothing deleted; you take it from here.
> 4. **Discard this work** — branch and worktree deleted permanently.
>
> Which option?

Wait for the answer. Do not pre-select. Do not merge "since it's obviously option 1".

## Step 5 — Execute the chosen path

**Option 1 — merge locally:**

```bash
cd <main-checkout> && git merge <branch>
~/.bun/bin/bun test        # re-run on the MERGED result — the merge itself can break things
```

Tests green on the merged result → proceed to Step 6 cleanup. Tests fail → stop, report,
resolve before any cleanup.

**Option 2 — push + PR:**

```bash
git push -u origin <branch>
gh pr create --base <base> --title "<conventional title>" --body "<summary + test evidence>"
```

Keep the worktree and branch alive — review feedback will need somewhere to land.

**Option 3 — keep as-is:** report branch name, worktree path (if any), and current SHA.
No cleanup. Done.

**Option 4 — discard:** destructive and irreversible. Require a typed confirmation:

> This permanently deletes branch `<branch>` and its worktree. Type **discard** to confirm.

Only the literal word confirms. Anything else — including "yes", "sure", "go ahead" —
means stop and re-ask. On confirmation: Step 6 with `git branch -D` (not `-d`) and
`git worktree remove --force`.

## Step 6 — Cleanup (options 1 and 4 only) — ordering traps

Order is load-bearing:

1. **`cd` OUT of the worktree first** — you cannot remove a directory you're standing in,
   and some shells keep a dead cwd afterward:
   ```bash
   cd <main-checkout>
   ```
2. **Remove the worktree BEFORE deleting the branch** — git refuses to delete a branch
   checked out in any worktree:
   ```bash
   git worktree remove <worktree-path>
   git branch -d <branch>        # -D only on the discard path
   ```
3. **Only clean up worktrees you created.** A worktree you found when the work started
   belongs to your partner — leave it.

## Rationalization table

| You're thinking | Reality |
|---|---|
| "Tests failed but it's unrelated flakiness" | Unverified claim. Prove it (run on base) or fix it. The gate stands. |
| "Obviously they want it merged, why ask" | Integration is your partner's call. Four options, every time. |
| "I'll delete the branch first, worktree later" | Git refuses; then a half-cleaned state confuses the next session. Worktree first. |
| "'Sure, discard it' counts as confirmation" | Only the typed word `discard`. Destructive actions get exact confirmation. |

## Red flags

- Presenting fewer than the 4 options, or presenting them after already merging.
- Merging without re-running tests on the merged result.
- Cleaning up a worktree you didn't create.
- Treating "yes" as a discard confirmation.

All of these mean: stop and return to the step whose gate you skipped.
