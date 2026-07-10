# Testing anti-patterns

Five ways a test suite rots into theater. Each one has a violation, a reason it's wrong, a
fix, and a Gate Function — a pre-flight check to run BEFORE writing the test. All examples
are TypeScript with `bun:test`.

The TDD tie-back: **if you're testing mock behavior, you violated TDD** — you added mocks
without watching the test fail against real code first. A test that failed for the right
reason once cannot be a tautology.

## Anti-pattern 1 — Testing mock behavior

**Violation:**

```typescript
import { test, expect, mock } from "bun:test";

test("session loop calls the provider", async () => {
  const provider = { complete: mock(async () => ({ text: "ok", toolCalls: [] })) };
  const engine = new SessionEngine({ provider });
  await engine.step();
  expect(provider.complete).toHaveBeenCalled();       // proves the mock was called
  expect(provider.complete).toHaveBeenCalledTimes(1); // ...so what?
});
```

**Why wrong:** the assertions verify the mock's bookkeeping, not the engine's behavior.
This test passes even if the engine throws away the provider's response, corrupts the
message history, or emits nothing. It can only fail if you rename a method — which the
type checker already catches.

**Fix — assert on observable output:**

```typescript
test("session loop appends the provider reply to history", async () => {
  const provider = { complete: async () => ({ text: "ok", toolCalls: [] }) };
  const engine = new SessionEngine({ provider });
  await engine.step();
  expect(engine.messages.at(-1)).toEqual({ role: "assistant", content: "ok" });
});
```

**Gate Function:**

```
BEFORE writing any assertion:
  ask: "if the production code were deleted, would this test still pass?"
  ask: "am I asserting on the system's output, or on the mock's call log?"
  IF the assertion is toHaveBeenCalled*: justify why the CALL is the behavior
     (rare: fire-and-forget side effects like telemetry). Otherwise rewrite.
```

## Anti-pattern 2 — Test-only methods on production classes

**Violation:**

```typescript
// src/session/store.ts
export class SessionStore {
  // ...real API...
  /** test helper — do not use in production */
  resetForTests(): void {
    this.sessions.clear();
  }
}
```

**Why wrong:** production code now carries an API whose only caller is the test suite.
It ships in the bundle, shows up in autocomplete, and one day someone "reuses" it in
production code. Worse, tests that need it are telling you the real API can't reach the
state they need — a design smell being silenced instead of heard.

**Fix — move it to a test utility that composes the public API:**

```typescript
// test/util/stores.ts
export function freshStore(): SessionStore {
  return SessionStore.create(mkdtempSync(join(tmpdir(), "coven-store-")));
}
```

Each test gets a fresh instance through the real constructor path. Nothing test-only
exists in `src/`.

**Gate Function:**

```
BEFORE adding a method to a production class:
  ask: "will any production code path call this?"
  IF no: it goes in test/util/, built from the public API.
  IF the public API can't produce the state the test needs:
     the API is missing a legitimate operation OR the test is testing internals. Decide which.
```

## Anti-pattern 3 — Mocking without understanding the dependency's side effects

**Violation:**

```typescript
test("tool registry runs bash", async () => {
  // bash.execute ALSO records the command in the permission audit log — mocker didn't know
  const bash = { execute: mock(async () => ({ stdout: "ok", exitCode: 0 })) };
  const registry = new ToolRegistry({ bash });
  const result = await registry.run("bash", { command: "echo ok" });
  expect(result.stdout).toBe("ok");
});
// downstream test asserts the audit log has one entry → fails mysteriously in full suite
```

**Why wrong:** the real dependency did more than return a value — it wrote the audit log,
touched cwd, emitted a bus event. The mock silently deletes those side effects, so the
test passes while hiding behavior the rest of the system depends on. These are the bugs
that only appear "in integration".

**Fix — run against the real implementation FIRST; mock at the lower level:**

```typescript
// 1. Write the test against the REAL bash tool and watch what actually happens.
// 2. If isolation is needed, mock the LOWEST boundary (the process spawn),
//    not the rich object above it — the audit log and bus events still run.
const spawn = mock(async () => ({ stdout: "ok", exitCode: 0 }));
const registry = new ToolRegistry({ bash: createBashTool({ spawn }) });
```

**Gate Function:**

```
BEFORE mocking a dependency:
  1. run the test once against the REAL implementation; observe every side effect
     (files, env, events, logs).
  2. list the side effects the system under test relies on.
  3. mock at the lowest level that preserves them — or don't mock at all.
  IF you can't list the side effects: you don't understand the dependency well enough to mock it.
```

## Anti-pattern 4 — Incomplete / partial mocks

**Violation:**

```typescript
test("renders the session header", () => {
  // real Session has id, title, model, usage, createdAt, messages...
  const session = { title: "My session" } as Session; // "as" hides the lie
  expect(renderHeader(session)).toContain("My session");
});
```

**Why wrong:** the cast smuggles an impossible object into the system. `renderHeader`
works today because it happens to read only `title`; the day it also reads
`session.usage.totalTokens`, this test throws `undefined is not an object` — a fake
failure about the FIXTURE, not the code. Partial mocks also let tests pass with shapes
that can never exist in production.

**Fix — mock the COMPLETE data structure as it exists in reality:**

```typescript
// test/util/fixtures.ts — one honest builder, overridable per test
export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "ses_test",
    title: "My session",
    model: "anthropic/claude",
    usage: { inputTokens: 0, outputTokens: 0 },
    createdAt: Date.now(),
    messages: [],
    ...overrides,
  };
}
```

**Gate Function:**

```
BEFORE creating a fixture:
  IF you need "as Type" or "as unknown as Type" to make it compile: STOP.
  Build the full object (fixture builder), taking every field the real type requires.
  Overrides express what THIS test cares about; the builder guarantees reality.
```

## Anti-pattern 5 — Tests as afterthought

**Violation:**

```typescript
// implementation written and "manually verified" this morning; now, dutifully:
test("parseFrontmatter works", () => {
  const { data } = parseFrontmatter("---\nname: x\n---\nbody");
  expect(data["name"]).toBe("x"); // asserts what the code DOES, not what it SHOULD do
});
```

**Why wrong:** a test written after the implementation is a transcript of the code's
current behavior — bugs included. It was never seen failing, so there's no evidence it can
detect anything. The edge cases it covers are the ones the implementation remembered, not
the ones the requirements demanded.

**Fix:** this is not fixable at the test level — the order was the defect. Delete the
implementation, write the failing test, watch it fail, reimplement. The full loop lives in
`SKILL.md` (Iron Law: NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST).

**Gate Function:**

```
BEFORE writing a test:
  ask: "does the implementation for this behavior already exist?"
  IF yes: you are in anti-pattern 5. Delete the implementation (yes, really),
          write the test, watch it fail, rewrite.
```

## When mocks become too complex

Warning signs that the mock has outgrown the test:

- Mock setup is longer than the test logic.
- The mock needs its own state machine to answer calls in the right order.
- You're fixing bugs IN THE MOCK.
- A change to the dependency's internals breaks ten mock setups but zero behavior.

Any of these → stop mocking and write an integration test against the real dependency
(temp dirs, real files, real subprocess). Slower per-run, but it tests something true.

## Quick reference

| Anti-pattern | Tell | Fix |
|---|---|---|
| Testing mock behavior | `expect(fn).toHaveBeenCalled()` as the main assert | Assert on system output |
| Test-only production methods | `resetForTests()` in `src/` | Test utility over the public API |
| Mocking blind | Never ran against the real thing | Real run first; mock the lowest boundary |
| Partial mocks | `as Type` on a fixture | Complete fixture builder |
| Tests as afterthought | Implementation predates test | Delete, RED, GREEN |

## Red flags

- `*-mock` names or testIDs leaking into assertions.
- Mock setup is more than half the test body.
- "Mocking just to be safe."
- `as unknown as` in a fixture.
- A test that has never failed.

All of these mean: stop, run the Gate Function for the anti-pattern you're in, and rewrite
the test before the implementation moves another line.
