---
name: brainstorming
description: Use when starting any new feature, component, or project — before writing code, before writing a plan, even when the task looks simple.
---

# Brainstorming: design before build

<HARD-GATE>
Do NOT write code, invoke implementation skills, or scaffold files until a design has been
presented and the user has approved it. This applies to EVERY project regardless of
perceived simplicity.
</HARD-GATE>

## Checklist (each item becomes a todo)

1. Explore the existing context: what's already in the repo, what patterns exist, what the
   reference material says.
2. Ask clarifying questions **one at a time**, multiple-choice where possible. Stop when
   you can state the requirements without hedging.
3. Propose 2–3 approaches with tradeoffs; recommend one and say why.
4. Present the design in sections scaled to complexity (small design = one message);
   get explicit approval on each section.
5. Write the approved design to `docs/specs/YYYY-MM-DD-<topic>.md`.
6. Self-review the spec: placeholder scan, internal consistency, scope creep, ambiguity.
7. Terminal state: invoke `writing-plans`. Nothing else.

## Anti-rationalization table

| You're thinking | Reality |
|---|---|
| "This is too simple to need a design" | Simple things grow. The 5-minute design catches the 2-hour rework. |
| "The user already told me what to build" | They told you the goal, not the decisions. Surface the decisions. |
| "I'll design as I code" | That's called rework with extra steps. |

## Principles

- YAGNI ruthlessly. Every feature must earn its place now.
- Oversized project → decompose into sub-projects, each with its own spec → plan → build cycle.
