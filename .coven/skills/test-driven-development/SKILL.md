---
name: test-driven-development
description: Use when implementing any feature or bugfix, before writing implementation code.
---

# Test-driven development

## Iron Law

NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.

If you wrote production code before its test: delete the code, write the test, watch it
fail, then rewrite. Keeping it "because it's already written" is the sunk-cost fallacy.
**Violating the letter of the rule is violating the spirit of the rule.**

## The loop

1. **RED** — write one failing test for the next small behavior.
2. **Verify RED** — run it. Watch it fail. Confirm it fails for the RIGHT reason (a real
   assertion miss, not a typo/import error). If you didn't watch it fail, you don't know
   it tests anything.
3. **GREEN** — minimal code to pass. Resist implementing ahead of the tests.
4. **Verify GREEN** — run it. Watch it pass. Run the surrounding suite.
5. **REFACTOR** — clean up with green tests as a net. Then next behavior.

## Rationalization table

| Excuse | Reality |
|---|---|
| "It's just a small helper" | Small helpers with wrong edge behavior cause big debugging sessions. |
| "I'll add tests after" | After never comes, and post-hoc tests assert what the code does, not what it should do. |
| "The types make it obviously correct" | Types prove shape, not behavior. |
| "Already spent an hour on this code" | Sunk cost. Delete means delete. |
| "Deadline pressure" | Debugging untested code is slower than TDD. That's why the law exists. |

## Red flags — stop immediately if you notice

- Writing `expect` after the implementation already passes.
- A test you never saw fail.
- "I'll just verify manually this once."
