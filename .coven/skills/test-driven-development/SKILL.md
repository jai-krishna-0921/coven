---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code.
---

# Test-driven development

## Iron Law

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.
```

Violating the letter is violating the spirit of the rules.

If you wrote production code before its test: delete the code, write the test, watch it
fail, then rewrite. Keeping it "because it's already written" is the sunk-cost fallacy.

**Escape hatch:** exceptions (throwaway spike scripts, generated code, pure config) exist
but require your human partner's explicit approval FIRST. You do not grant yourself
exceptions. If a spike is approved, the spike code is deleted before real work starts.

## The loop

1. **RED** — write one failing test for the next small behavior.
2. **Verify RED (mandatory run)** — run it and READ the output.
   - Expected: FAIL on an assertion — e.g. `Expected: 3, Received: undefined`.
   - An import error, typo, or `Cannot find module` is NOT a valid RED — fix the test and
     re-run until it fails for the RIGHT reason.
   - Test passes immediately? You're testing existing behavior — fix the test.
3. **GREEN** — minimal code to pass. Resist implementing ahead of the tests.
4. **Verify GREEN (mandatory run)** — run it and READ the output.
   - Expected: the new test passes AND the surrounding suite stays green.
   - Output pristine: no stray warnings or errors, even on pass.
5. **REFACTOR** — clean up with green tests as a net. Re-run. Then next behavior.

## Good and bad, side by side

**RED phase — a good test:**

```typescript
// Good: clear name, tests real behavior, one thing
test("retryOperation retries a failing call until it succeeds", async () => {
  let calls = 0;
  const result = await retryOperation(async () => {
    calls++;
    if (calls < 3) throw new Error("transient");
    return "ok";
  });
  expect(result).toBe("ok");
  expect(calls).toBe(3);
});
```

**RED phase — a bad test:**

```typescript
// Bad: vague name, tests the mock instead of the behavior
test("retry works", async () => {
  const fn = mock(() => "ok");
  await retryOperation(fn);
  expect(fn).toHaveBeenCalled(); // proves the mock was called. So what?
});
```

**GREEN phase — over-engineering (also a violation):**

```typescript
// Bad: no test asked for any of this
export async function retryOperation<T>(fn: () => Promise<T>, options?: {
  maxAttempts?: number; backoffMs?: number; onRetry?: (n: number) => void; // YAGNI, YAGNI, YAGNI
}): Promise<T> { /* ... */ }
```

Write the options bag when a failing test demands it, not before.

## Why order matters

- **Tests-after answer "What does this do?" Tests-first answer "What should this do?"**
  Only the second question finds design problems before they're load-bearing.
- **Tests-after are biased by your implementation.** You verify the edge cases you
  remembered to handle, not the ones you should have discovered.
- **A test you never watched fail proves nothing.** It may pass for any reason — wrong
  import, testing a tautology, asserting on the mock. Watching it fail is the only
  evidence it can detect the bug it claims to detect.

## Rationalization table

| Excuse | Reality |
|---|---|
| "It's just a small helper" | Small helpers with wrong edge behavior cause big debugging sessions. |
| "I'll add tests after" | After never comes, and post-hoc tests assert what the code does, not what it should do. |
| "The types make it obviously correct" | Types prove shape, not behavior. |
| "Already spent an hour on this code" | Sunk cost. Delete means delete. |
| "Deadline pressure" | Debugging untested code is slower than TDD. That's why the law exists. |
| "Keep it as reference while I write tests" | You'll adapt it. That's testing after. Delete means delete. |
| "Need to explore first" | Fine. Throw away the exploration, then start with TDD. |
| "Test hard to write = TDD overhead" | Hard to test = hard to use. The test is telling you the design is wrong. |

## Red flags — stop immediately if you notice

- Writing `expect` after the implementation already passes.
- A test you never saw fail.
- "I'll just verify manually this once."
- "I already manually tested it."
- "It's about the spirit, not the ritual."
- "This is different because…"

All of these mean: delete the code. Start over with TDD.

## Verification checklist — before claiming TDD was followed

- [ ] Every new behavior has a test written BEFORE its implementation.
- [ ] I ran each test and watched it FAIL before implementing.
- [ ] Each failure was an assertion miss, not an error.
- [ ] I wrote only enough code to pass the current test.
- [ ] I ran each test and watched it PASS after implementing.
- [ ] The full surrounding suite is green.
- [ ] Test output is pristine — no stray warnings/errors.
- [ ] No production code exists without a test that demanded it.

Can't check all boxes? You skipped TDD. Start over.

## When stuck

| Problem | Solution |
|---|---|
| Don't know how to test it | Write the API call you WISH existed and the assertion you want; work backward. |
| Must mock everything to test it | Code too coupled — inject dependencies instead of piling on mocks. |
| Test setup is enormous | The design is too complicated. Simplify the unit under test. |
| Adding mocks or test utilities | Read `test-driven-development/testing-anti-patterns.md` FIRST. |

## Debugging integration

Bug found? Write the failing test that reproduces it FIRST. Never fix a bug without a
test. REQUIRED SUB-SKILL: systematic-debugging (its Phase 4 lands back here). Before
claiming the fix works: verification-before-completion.
