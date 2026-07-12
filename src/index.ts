#!/usr/bin/env node
/**
 * coven — CLI entry.
 *
 *   coven                       interactive TUI
 *   coven run -p "prompt"       one-shot print mode (--agent, --yes)
 *   coven agents                list agents
 *   coven skills                list skills
 *   coven models [provider]     list the model catalog
 *   coven auth login|list|logout [provider]   BYOK credentials
 */
import * as readline from "node:readline";
import { AuthStore, ENV_KEYS } from "./auth/index.ts";
import { ModelCatalog } from "./catalog/index.ts";
import { createApp } from "./app.ts";
import { runTui } from "./tui/index.ts";
import { bold, cyan, dim, green, red, yellow } from "./util/ansi.ts";

const VERSION = "0.3.0";

function ask(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    }),
  );
}

async function authCommand(positional: string[]): Promise<void> {
  const auth = new AuthStore();
  const [, sub = "list", providerArg] = positional;
  if (sub === "list" || sub === "ls") {
    const entries = auth.entries();
    if (entries.length === 0) {
      console.log(dim("no credentials — run: coven auth login <provider>"));
      console.log(dim(`known env vars: ${Object.values(ENV_KEYS).join(", ")}`));
      return;
    }
    for (const entry of entries) {
      console.log(`${green("●")} ${bold(entry.provider.padEnd(14))} ${dim(`${entry.masked} (${entry.source})`)}`);
    }
    return;
  }
  if (sub === "login") {
    const provider = providerArg ?? (await ask(`provider (${Object.keys(ENV_KEYS).join("/")} or custom): `));
    if (!provider) return;
    const key = await ask(`API key for ${provider}: `);
    if (!key) return;
    auth.set(provider, key);
    console.log(`${green("✓")} stored credential for ${bold(provider)} ${dim("(~/.local/share/coven/auth.json, mode 0600)")}`);
    return;
  }
  if (sub === "logout") {
    const provider = providerArg ?? (await ask("provider to remove: "));
    const removed = auth.remove(provider);
    console.log(removed ? `${green("✓")} removed ${provider}` : `${red("✗")} no stored credential for ${provider}`);
    return;
  }
  console.log("usage: coven auth [list|login <provider>|logout <provider>]");
}

async function modelsCommand(providerFilter?: string): Promise<void> {
  const catalog = await ModelCatalog.load();
  const models = catalog.list(providerFilter);
  if (models.length === 0) {
    console.log(dim(providerFilter ? `no models for provider "${providerFilter}"` : "catalog empty"));
    return;
  }
  models.sort((a, b) => a.providerID.localeCompare(b.providerID) || (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
  for (const model of models.slice(0, 60)) {
    const ctx = model.contextLimit >= 1_000_000 ? `${model.contextLimit / 1_000_000}M` : `${Math.round(model.contextLimit / 1000)}k`;
    const price = model.cost.input > 0 ? `$${model.cost.input}/${model.cost.output} per 1M` : "free/local";
    console.log(`${cyan("○")} ${bold(`${model.providerID}/${model.modelID}`.padEnd(46))} ${dim(`${ctx} ctx · ${price}`)}`);
  }
  if (models.length > 60) console.log(dim(`… ${models.length - 60} more — filter with: coven models <provider>`));
}

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
  coven models [provider]    browse the model catalog (models.dev + fallback)
  coven auth login <prov>    store an API key (BYOK) — also list / logout

Config: coven.json (project) / ~/.config/coven/coven.json (global)
Keys:   env vars (ANTHROPIC_API_KEY, …) or coven auth login
Voice:  /voice in the TUI (say / espeak / piper / PowerShell / OpenAI TTS)`);
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
  if (command === "auth") {
    await authCommand(positional);
    return;
  }
  if (command === "models") {
    await modelsCommand(positional[1]);
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
  try {
    await runTui(app);
  } finally {
    await app.dispose();
  }
}

main().catch((error) => {
  console.error(`${red("coven fatal:")} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
