#!/usr/bin/env bun
/**
 * coven — CLI entry.
 *
 *   coven                       interactive TUI
 *   coven run -p "prompt"       one-shot print mode (--agent, --yes)
 *   coven agents                list agents
 *   coven skills                list skills
 */
import { createApp } from "./app.ts";
import { Tui } from "./tui/index.ts";
import { bold, dim, green, red, yellow } from "./util/ansi.ts";

const VERSION = "0.1.0";

function parseFlags(args: string[]): { flags: Map<string, string | true>; positional: string[] } {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-p" || arg === "--prompt") flags.set("prompt", args[++i] ?? "");
    else if (arg === "--agent") flags.set("agent", args[++i] ?? "");
    else if (arg === "--yes" || arg === "-y") flags.set("yes", true);
    else if (arg.startsWith("--")) flags.set(arg.slice(2), true);
    else positional.push(arg);
  }
  return { flags, positional };
}

async function runPrintMode(prompt: string, agentName: string | undefined, autoYes: boolean): Promise<void> {
  const app = await createApp();
  const agent = agentName ?? app.loaded.config.default_agent ?? "builder";
  if (!app.agents.get(agent)) {
    console.error(`${red("✗")} no agent "${agent}"`);
    process.exit(1);
  }

  // Non-interactive permission policy: --yes approves asks; otherwise reject
  // with guidance (deny rules always deny regardless).
  app.bus.subscribe((event) => {
    if (event.type === "permission.asked") {
      if (autoYes) {
        app.permissions.reply(event.request.id, "once");
      } else {
        console.error(`${yellow("⚠")} auto-rejected: ${event.request.permission} → ${event.request.patterns.join(", ")} (use --yes)`);
        app.permissions.reply(event.request.id, "reject", "Non-interactive run without --yes: action not permitted.");
      }
    }
    if (event.type === "part.delta") process.stdout.write(event.delta);
    if (event.type === "tool.finished") process.stderr.write(`${dim(`[${event.tool}]`)}\n`);
  });

  const session = app.store.create({ agent });
  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  try {
    await app.engine.prompt(session.id, prompt, abort.signal);
    process.stdout.write("\n");
  } finally {
    await app.dispose();
  }
}

async function main(): Promise<void> {
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const command = positional[0];

  if (flags.has("version") || command === "version") {
    console.log(`coven ${VERSION}`);
    return;
  }
  if (flags.has("help") || command === "help") {
    console.log(`${bold("coven")} ${VERSION} — a coven of coding agents in your terminal

Usage:
  coven                      interactive session
  coven run -p "<prompt>"    one-shot mode (--agent <name>, --yes to auto-approve)
  coven agents               list available agents
  coven skills               list discovered skills

Config: coven.json (project) / ~/.config/coven/coven.json (global)
Env:    ANTHROPIC_API_KEY (or provider-specific key envs)`);
    return;
  }

  if (command === "agents") {
    const app = await createApp();
    for (const agent of app.agents.all().filter((a) => !a.hidden)) {
      console.log(`${green("●")} ${bold(agent.name.padEnd(12))} ${dim(`[${agent.mode}]`)} ${agent.description}`);
    }
    return;
  }
  if (command === "skills") {
    const app = await createApp();
    const skills = app.skills.all();
    if (skills.length === 0) console.log(dim("no skills discovered (.coven/skills, .claude/skills, ~/.config/coven/skills)"));
    for (const skill of skills) console.log(`${yellow("◆")} ${bold(skill.name)} — ${skill.description}`);
    return;
  }
  if (command === "run") {
    const prompt = flags.get("prompt");
    if (typeof prompt !== "string" || !prompt) {
      console.error(`${red("✗")} coven run requires -p "<prompt>"`);
      process.exit(1);
    }
    await runPrintMode(prompt, typeof flags.get("agent") === "string" ? (flags.get("agent") as string) : undefined, flags.get("yes") === true);
    return;
  }

  const app = await createApp();
  await new Tui(app).run();
}

main().catch((error) => {
  console.error(`${red("coven fatal:")} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
