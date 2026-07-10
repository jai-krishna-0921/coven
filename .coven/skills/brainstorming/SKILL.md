---
name: brainstorming
description: Use when starting any new feature, component, or project — before writing code, before writing a plan, even when the task looks simple.
---

# Brainstorming: design before build

## Iron Law

```
NO CODE, NO SCAFFOLDING, NO IMPLEMENTATION SKILLS UNTIL THE USER HAS APPROVED A DESIGN.
```

Violating the letter is violating the spirit of the rules.

<HARD-GATE>
Do NOT write code, invoke implementation skills, or scaffold files until a design has been
presented and the user has approved it. This applies to EVERY project regardless of
perceived simplicity.
</HARD-GATE>

## Scope check — BEFORE any questions

If the request contains multiple independent subsystems (e.g. "a TUI, a plugin system, and
a sync server"), flag decomposition FIRST. Do not burn clarifying questions refining
details of a project that needs splitting. Each sub-project gets its own
spec → plan → build cycle. Say so, propose the split, get agreement, then brainstorm ONE
sub-project.

## The flow

```
explore existing context
        ↓
clarifying questions (ONE at a time)
        ↓
propose 2–3 approaches, recommend one
        ↓
present design in sections
        ↓
  user approves design? ──no, revise──→ back to "present design"
        ↓ yes
write spec to docs/specs/YYYY-MM-DD-<topic>.md
        ↓
spec self-review (fix inline, no re-review)
        ↓
  user reviews spec? ──changes requested──→ edit → re-run self-review → ask again
        ↓ approved
invoke writing-plans        ← TERMINAL STATE
```

The two loop-backs are the point: "approved with changes" is NOT approved. Revise and ask
again.

## Checklist (each item becomes a todo)

1. Explore the existing context: what's already in the repo, what patterns exist, what the
   reference material says.
2. Ask clarifying questions **one at a time**, multiple-choice where possible. Each answer
   changes the next question. Stop when you can state the requirements without hedging.
3. Propose 2–3 approaches with tradeoffs; recommend one and say why.
4. Present the design in sections scaled to complexity (small design = one message);
   get explicit approval on each section.
5. Write the approved design to `docs/specs/YYYY-MM-DD-<topic>.md`.
6. Self-review the spec (four passes, fix inline, no re-review):
   - **Placeholder scan** — no "TBD", "etc.", "and so on", "handle appropriately".
   - **Internal consistency** — no section contradicts another; names match throughout.
   - **Scope** — nothing crept in that the user didn't approve; YAGNI holds.
   - **Ambiguity** — no requirement readable two ways by a fresh implementer.
7. User review gate (verbatim script below). Wait for the response.
8. Terminal state: invoke `writing-plans`. Nothing else.

## User review gate — verbatim script

> Spec written to `docs/specs/<file>`. Please review it and tell me what to change before
> I write the implementation plan.

Wait for the response. Changes requested → edit → re-run self-review → ask again. Do not
proceed on silence or on your own satisfaction with the document.

Optionally, before the human gate, dispatch a `reviewer` subagent with
`brainstorming/spec-reviewer.md` to catch placeholders and contradictions cheaply. The
subagent review supplements the human gate; it never replaces it.

## Terminal state

The ONLY skill you invoke after brainstorming is **writing-plans**. Do NOT start
implementing, scaffolding, generating boilerplate, or invoking any other skill. A finished
spec is not permission to build — it is input to a plan.

## Design for isolation

Design each unit so a fresh context can build it alone. Every unit in the design must
answer three questions:

1. What does it do? (one sentence)
2. How do you use it? (the exact interface: names, types)
3. What does it depend on? (nothing that isn't named)

You reason better about code you can hold in context at once. If a unit's description
needs the whole system explained first, the boundaries are wrong — redraw them.

## Rationalization table

| You're thinking | Reality |
|---|---|
| "This is too simple to need a design" | Simple things grow. The 5-minute design catches the 2-hour rework. |
| "The user already told me what to build" | They told you the goal, not the decisions. Surface the decisions. |
| "I'll design as I code" | That's called rework with extra steps. |
| "I'll ask all my questions at once to save round-trips" | Batched questions get shallow answers. One at a time; each answer changes the next question. |
| "The codebase makes the approach obvious" | Then the design takes two sentences. Write them and get the yes. |
| "User is in a hurry" | A wrong build is the slowest possible outcome. |

## Red flags — phrases in your own head

- "I'll just stub out the files while we talk"
- "The design is basically approved"
- "I can skip the spec doc, the chat log has everything"
- "This question is too basic to ask"
- "I'll combine the design and the plan into one document"

All of these mean: stop, go back to the flow, and ask the next question.

## Principles

- YAGNI ruthlessly. Every feature must earn its place now.
- Oversized project → decompose into sub-projects, each with its own spec → plan → build
  cycle.
