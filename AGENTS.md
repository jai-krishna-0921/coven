# Coven — agent instructions

You are working on Coven itself: a terminal-based multi-agent coding assistant (Bun + TypeScript).

## Standards

- ESM only, named exports, no default exports (exception: plugin modules, which default-export their entry function).
- Strict TypeScript. No `any` — use `unknown` and narrow. Typed errors extend `NamedError` (`src/util/error.ts`).
- One concern per directory under `src/`. Dependencies point downward only:
  `util → bus/config → permission → provider → tool → agent/skill/plugin → session → tui`.
  A lower layer importing from a higher one is an architecture defect.
- Public shapes live in each module's `types.ts`; implementations import from it, never the reverse.
- Tests: `bun test`. New behavior lands with its test in the same commit. Test names are sentences.
- Commits: conventional (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`), small and atomic.
- Dependencies: currently exactly two runtime deps (`@anthropic-ai/sdk`, `zod`). Adding one requires strong justification.

## Workflow

Design before code (brainstorming skill) → plan (writing-plans) → TDD (test-driven-development) →
verify before claiming done (verification-before-completion). Skills live in `.coven/skills/`.

## Verify

```
bun test            # suite must be green
bunx tsc --noEmit   # typecheck must be clean
```
