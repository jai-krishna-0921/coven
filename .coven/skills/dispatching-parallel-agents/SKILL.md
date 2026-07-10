---
name: dispatching-parallel-agents
description: Use when facing multiple independent failures, tasks, or investigations that could each be handled by a separate subagent — before dispatching anything.
---

# Dispatching parallel agents

## The independence test — run it first

```
                 ┌─────────────────────────────┐
                 │ Are the tasks/failures      │
                 │ related (same root cause,   │
                 │ same subsystem, one story)? │
                 └──────────┬──────────────────┘
                 yes ◄──────┴──────► no
                  │                  │
        ┌─────────▼────────┐  ┌──────▼───────────────────┐
        │ ONE agent for    │  │ Would the agents edit    │
        │ the whole group  │  │ the same files or shared │
        │ (splitting hides │  │ state (config, fixtures, │
        │ the root cause)  │  │ lockfile)?               │
        └──────────────────┘  └──────┬───────────────────┘
                              yes ◄──┴──► no
                               │          │
                    ┌──────────▼───────┐ ┌▼──────────────────┐
                    │ SEQUENTIAL:      │ │ PARALLEL: dispatch │
                    │ one dispatch per │ │ ALL of them in ONE │
                    │ turn, in order   │ │ turn               │
                    └──────────────────┘ └───────────────────┘
```

## The mechanics — Coven's task tool semantics

**Multiple task dispatches in ONE turn run concurrently; one dispatch per turn =
sequential.** The session loop batches all tool calls emitted in a single assistant turn
into one wave and executes the wave in parallel. If you emit dispatches one at a time
across turns, you chose sequential execution whether you meant to or not.

## The 4-part prompt contract

Every dispatched agent is a fresh context. Its prompt MUST contain:

1. **Specific scope** — exactly which files/tests/failures it owns, and nothing else.
2. **Clear goal** — the single outcome that means "done".
3. **Constraints** — what it must NOT do (files it may not touch, deps it may not add,
   shortcuts it may not take).
4. **Expected output** — the shape of the report it returns.

One full example prompt:

```
Fix the 3 failing tests in test/session-timeout.test.ts.

Scope: test/session-timeout.test.ts and, if the root cause lives there,
src/session/loop.ts. Touch NOTHING else — other agents own the other failures.

Goal: all 3 tests pass, full suite still green, root cause understood and stated.

Constraints:
- Follow systematic-debugging: investigate before fixing.
- Do NOT just increase timeouts — find the real issue. If a wait is arbitrary,
  replace it with condition polling (see systematic-debugging/condition-based-waiting.md).
- No new dependencies. No changes to shared fixtures in test/util/.

Expected output: for each test — root cause (one sentence), the fix (file:line),
and the exact command + output proving it passes. Plus the full-suite result.
```

## Post-return verification

Agent reports are unverified claims (verification-before-completion applies to you, not
just to them):

1. Read each agent's summary — did it stay in scope? Did it state a root cause or just
   "fixed"?
2. Check for file conflicts: `git status` / `git diff --stat` — two agents touching one
   file means their combined result was never tested.
3. Run the FULL suite yourself. Each agent verified its slice; nobody verified the union.
4. Spot-check the diffs. **Agents can make systematic errors** — the same wrong assumption
   applied ten times, e.g. every agent "fixing" its tests by raising timeouts.

## When NOT to parallelize

- **Related failures** — one root cause fans out into many symptoms; parallel agents fix
  ten symptoms and miss the cause.
- **Exploratory debugging** — you don't know the shape of the problem yet, so you can't
  write scoped prompts.
- **You need the whole-system view** — cross-cutting refactors where each slice only makes
  sense given the others.
- **Shared files or state** — the flowchart already said sequential; believe it.

## Common mistakes

| ❌ Wrong | ✅ Right |
|---|---|
| "Fix all the tests" — agent gets lost in an unbounded task | One agent per test file / failure cluster, each with exact scope |
| Prompt says what to do but not what NOT to do | Constraints section in every prompt |
| Trust "all done" reports and move on | Full suite + diff spot-check after every wave |
| Dispatch one agent, wait, dispatch the next — by habit | Independent work → all dispatches in ONE turn |
