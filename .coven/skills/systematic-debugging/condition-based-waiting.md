# Condition-based waiting

Flaky async tests are almost never "just flaky" — they are races between an arbitrary
sleep and the real event. Never wait a guessed amount of time; wait for the actual
condition, with a timeout as the failure detector. Directly relevant to Coven's own
TUI/session tests, where the session loop, provider stream, and tool execution all settle
asynchronously.

## Before / after

```typescript
// BAD: guessed duration — too short on CI (flaky), too long locally (slow)
test("session loop emits a tool result", async () => {
  engine.submit("run the tests");
  await new Promise((r) => setTimeout(r, 500)); // why 500? nobody knows
  expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1);
});
```

```typescript
// GOOD: wait for the condition itself; timeout only marks failure
test("session loop emits a tool result", async () => {
  engine.submit("run the tests");
  await waitFor(
    () => events.some((e) => e.type === "tool_result"),
    "tool_result event emitted",
  );
  expect(events.filter((e) => e.type === "tool_result")).toHaveLength(1);
});
```

## The generic helper

```typescript
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  description: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, 10)); // 10ms poll: responsive, not busy
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${description}`);
}
```

The `description` is load-bearing: when the timeout fires, the error says WHAT never
happened, not just "timeout". The timeout is generous because it only fires on genuine
failure — a passing test exits at the first true poll, so a large timeout costs nothing.

## Quick-pattern table

| Waiting for | Condition |
|---|---|
| An event | `() => events.some((e) => e.type === "done")` |
| A state change | `() => engine.status === "idle"` |
| A count | `() => store.messages.length >= 3` |
| A file to exist | `() => existsSync(join(dir, "session.json"))` |
| Compound condition | `() => engine.status === "idle" && events.some((e) => e.type === "done")` |

## Common mistakes

| Mistake | Why it bites |
|---|---|
| Polling every 1ms | Busy-loop starves the very async work you're waiting on. 10ms is the floor. |
| No timeout | A never-true condition hangs the suite forever instead of failing with a message. |
| Caching state outside the loop | `const n = events.length; await waitFor(() => n >= 3, …)` — `n` is frozen; read the live value INSIDE the condition. |
| Waiting, then asserting on different data | Wait for the exact condition you assert on, or the race just moved. |

## When an arbitrary timeout IS correct

Only when the test's SUBJECT is timing itself (a debounce interval, a retry backoff, a
TTL) — and even then:

1. FIRST wait for the trigger condition (the thing that starts the clock).
2. THEN sleep the documented duration, derived from the code's own constant — never a
   guess.
3. Add a WHY comment naming the constant:

```typescript
await waitFor(() => input.buffered, "keystroke buffered");
// debounce flushes after DEBOUNCE_MS (50ms); 75ms = DEBOUNCE_MS + margin
await new Promise((r) => setTimeout(r, 75));
expect(flushes).toHaveLength(1);
```

Everything else — "give it a moment to settle", "CI is slow" — is a condition you haven't
identified yet. Identify it and poll for it.
