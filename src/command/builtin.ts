/**
 * Builtin slash commands. Templates are prompts, not code — the model does the
 * work with its normal tools. Adapted from OpenCode's command templates.
 */
import type { CommandDef } from "./types.ts";

const INIT_TEMPLATE = `Create or update \`AGENTS.md\` for this repository.

The goal is a compact instruction file that helps future agent sessions avoid
mistakes and ramp up quickly. Every line should answer: would an agent likely
miss this without help? If not, leave it out.

## User-provided focus

$ARGUMENTS

If a focus is given above, prioritize it. Otherwise cover the whole repository.

## How to investigate

- Read the README, package manifests (package.json, pyproject.toml, Cargo.toml,
  go.mod, etc.), CI configs, and lint/formatter configs.
- Read any existing \`AGENTS.md\`, \`CLAUDE.md\`, \`.cursorrules\`, or copilot
  instruction files and fold in what is still true.
- Prefer executable sources of truth over prose: scripts, CI steps, and config
  files beat documentation that may have drifted.

## What to extract

- Exact commands for dev, build, lint, and test — including how to run a
  single test file or single test case.
- Toolchain quirks: required versions, package manager, env vars, codegen
  steps, anything that fails silently when done wrong.
- Monorepo boundaries: which packages exist, where shared code lives, which
  directories an agent should not touch.
- Project-specific conventions that differ from language defaults.

## Writing rules

- Be specific and terse. Exclude generic advice ("write tests", "use clear
  names") — agents already know it.
- No filler sections; skip anything the repo cannot answer.
- When in doubt, omit.

If \`AGENTS.md\` already exists, improve it in place rather than rewriting blindly:
keep what is correct, fix what is stale, add what is missing.`;

const REVIEW_TEMPLATE = `Review code changes in this repository.

## Determine the review target

Target: $ARGUMENTS

- If the target above is empty: review uncommitted changes — run
  \`git diff HEAD\` (plus \`git status\` for untracked files).
- If it is a commit sha: review that commit — \`git show <sha>\`.
- If it is a branch name: review the branch against its merge base —
  \`git diff $(git merge-base HEAD <branch>)...<branch>\`.

Read the FULL diff before forming any opinion. Open surrounding files where
the diff alone lacks context.

## Deliver two separate verdicts

1. **Spec / intent compliance** — does the change do what it set out to do?
   Compare against the stated task, linked issue, commit messages, or obvious
   intent. Call out anything promised but not delivered.
2. **Code quality** — correctness, error handling, naming, duplication,
   layering, tests.

Remember: what is NOT in the diff matters too — missing tests, missing error
paths, callers that needed updating, docs left stale.

## Findings

Rate every finding with a severity and make each one actionable:

- **Critical** — bugs, data loss, security issues; must fix before merge.
- **Important** — likely defects or maintainability problems; should fix.
- **Minor** — style, naming, small cleanups.

For each finding give the file:line location and a concrete fix (what to
change, not just what is wrong).

## Verify

If the project has a test suite, run it and report the results as part of the
review. If the change added behavior without tests, that is a finding.`;

// Both templates use only $ARGUMENTS; hints are kept literal here to avoid a
// cyclic import of the registry's hint extractor.
export const BUILTIN_COMMANDS: CommandDef[] = [
  {
    name: "init",
    description: "Generate or improve AGENTS.md for this project",
    template: INIT_TEMPLATE,
    source: "builtin",
    hints: ["$ARGUMENTS"],
  },
  {
    name: "review",
    description: "Review changes (uncommitted by default, or a commit/branch/PR given as argument)",
    template: REVIEW_TEMPLATE,
    agent: "reviewer",
    subtask: true,
    source: "builtin",
    hints: ["$ARGUMENTS"],
  },
];
