# Defense in depth

After the root-cause fix, validate at EVERY layer the bad data passed through on its way
to the symptom. One fix at one layer means "we fixed the bug." Validation at every layer
means "we made the bug impossible." Ship the second one.

## The framing

The worked example in `root-cause-tracing.md` ended at: a test read fixture state before
setup, so an empty `projectDir` flowed four layers down and `git init` ran in the source
tree. The root-cause fix (read fixture state inside the test body) kills this instance.
But every layer that silently accepted `""` is still willing to accept it from the NEXT
caller. Harden them all.

## The four layers

### Layer 1 — Entry-point validation

Reject bad input where it enters the module. In Coven this is the public function in the
module's `index.ts`, validating against the shapes in `types.ts`:

```typescript
// src/session/store.ts
export class SessionStore {
  static create(projectDir: string): SessionStore {
    if (!projectDir || !projectDir.trim()) {
      throw new SessionError({ code: "invalid_project_dir", dir: projectDir });
    }
    // ...
  }
}
```

### Layer 2 — Business-logic validation

Check domain rules, not just presence. A non-empty string can still be the wrong string:

```typescript
// deeper in the call chain — the value must also MAKE SENSE here
import { isAbsolute } from "node:path";

function resolveSessionDir(projectDir: string): string {
  if (!isAbsolute(projectDir)) {
    throw new SessionError({ code: "relative_project_dir", dir: projectDir });
  }
  return join(projectDir, ".coven", "sessions");
}
```

### Layer 3 — Environment guards

Make the dangerous operation itself refuse to run in a context it should never see —
independent of how it was called:

```typescript
// the choke point guards ITSELF
import { tmpdir } from "node:os";

async function gitInit(dir: string): Promise<void> {
  if (process.env["NODE_ENV"] === "test" && !dir.startsWith(tmpdir())) {
    throw new Error(`refusing git init outside tmpdir during tests: ${dir}`);
  }
  // ...actual operation
}
```

### Layer 4 — Debug instrumentation

Keep cheap, greppable evidence at the choke point so the NEXT bug in this area arrives
with a trail:

```typescript
log.debug("gitInit", { dir, cwd: process.cwd() }); // permanent, structured, low-noise
```

(Temporary `console.error` + `new Error().stack` tracing belongs in
`root-cause-tracing.md`; this layer is the permanent residue you leave behind.)

## Method

1. Trace the bad data's full path (you already have this from the backward trace).
2. Map every checkpoint the data passed through.
3. Add validation at each checkpoint — entry, business, environment, instrumentation.
4. Verify the layers: temporarily bypass Layer 1 (e.g. call the inner function directly
   in a test) and confirm Layer 2 or 3 still catches it. A layer you never saw fire is a
   layer you assume works.

## Why multiple layers — evidence

Each layer catches bugs the others miss:

- Tests that mock the entry point bypass Layer 1 — Layer 2's business checks caught the
  mocked garbage.
- An alternate code path added months later skipped the validated entry — Layer 3's
  environment guard stopped `git init` cold.

If any single layer were sufficient, the bug wouldn't have reached the symptom in the
first place. The layers aren't redundancy; they're coverage of paths you haven't written
yet.
