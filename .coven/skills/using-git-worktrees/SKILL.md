---
name: using-git-worktrees
description: Use when about to start implementation work — before the first commit of executing a plan, when currently on main/master, or whenever work needs isolation from the user's current branch.
---

# Using git worktrees

A worktree is a second checkout of the same repo in its own directory, on its own branch.
Work there and the user's current branch, uncommitted changes, and running processes stay
untouched. Never start implementation on main/master without explicit consent — a worktree
is how you avoid needing to ask twice.

## Step 0 — Detect existing isolation

You may ALREADY be isolated. Check before creating anything:

```bash
git rev-parse --git-dir
git rev-parse --git-common-dir
```

- Outputs **differ** (e.g. `.git/worktrees/foo` vs `/repo/.git`) → you are already in a
  linked worktree. Use it; do not nest another.
- **Submodule guard:** `git rev-parse --show-superproject-working-tree` prints a path →
  you are inside a submodule, not a worktree candidate. Worktree the superproject or ask —
  a worktree of a submodule detaches it from the superproject's pinning.
- On a feature branch in a normal checkout → isolation may already be sufficient; ask
  whether to work here or make a worktree.

## Step 1 — Consent question (verbatim)

If not isolated:

> Would you like me to set up an isolated worktree? It protects your current branch.

Wait for the answer. "No, work here" on main still means: no implementation commits
without a branch — create at least a feature branch in place.

## Step 2 — Choose the directory

Priority order:

1. A preference the user or project config has declared (e.g. in CLAUDE.md / coven.json).
2. An existing `.worktrees/` directory in the repo — a convention already in use wins.
3. Default: `.worktrees/` at the repo root.

**Safety gate — the worktree must never become tracked content:**

```bash
git check-ignore -q .worktrees && echo ignored || echo NOT-ignored
```

If NOT ignored: add `.worktrees/` to `.gitignore`, commit that change, THEN proceed.
Otherwise the new worktree shows up as thousands of untracked files — and can get
committed into the repo it lives in.

## Step 3 — Create, set up, baseline

```bash
git worktree add .worktrees/<feature-name> -b <feature-branch>
cd .worktrees/<feature-name>
```

**Project setup** — a fresh worktree has no installed deps. Detect and run the project's
setup; for Coven (and any Bun project with a lockfile):

```bash
~/.bun/bin/bun install
```

**Baseline test run — before ANY work:**

```bash
~/.bun/bin/bun test
```

- Baseline green → record it and start work.
- **Baseline failing → report and ask.** Do not start; otherwise you can't distinguish
  bugs you introduced from bugs that were already there, and every later verification is
  ambiguous.

## Quick reference — situation → action

| Situation | Action |
|---|---|
| `--git-dir` ≠ `--git-common-dir` | Already in a worktree — use it |
| `--show-superproject-working-tree` non-empty | In a submodule — don't worktree it; ask |
| On main/master, normal checkout | Consent question, then worktree (or at minimum a branch) |
| On a feature branch already | Ask: work here, or separate worktree? |
| `.worktrees` not git-ignored | Add to `.gitignore` + commit BEFORE `git worktree add` |
| Fresh worktree created | `bun install`, then baseline `bun test` before any edit |
| Baseline red | STOP — report, ask; don't build on a broken base |
| Work finished | REQUIRED SUB-SKILL: finishing-a-branch (it owns cleanup ordering) |

## Red flags

- Creating a worktree without running the consent question.
- Skipping the baseline run "because the suite was green yesterday".
- A worktree directory visible in `git status`.
- Nesting a worktree inside another worktree.

All of these mean: stop and rerun the steps from Step 0.
