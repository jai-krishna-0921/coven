#!/usr/bin/env node
/**
 * coven — CLI entry.
 *
 *   coven                              interactive TUI
 *   coven --continue                   resume most recent session in TUI
 *   coven --session <id>               open a specific session in TUI
 *   coven run -p "prompt"              one-shot print mode
 *   coven run -p "prompt" -c           append to most recent session
 *   coven run -p "prompt" -s <id>      append to a specific session
 *   coven run -p "prompt" --fork -s <id>   fork a session, then prompt on the copy
 *   coven run -p "prompt" --format json    emit structured event lines to stdout
 *   coven agents                       list agents
 *   coven skills                       list skills
 *   coven models [provider]            list the model catalog
 *   coven auth login|list|logout       BYOK credentials
 *   coven session list|delete|export|import   session lifecycle
 *   coven upgrade [target]             pull the latest release
 *   coven completion [bash|zsh|fish]   emit shell completion script
 */
import * as readline from "node:readline";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { AuthStore, ENV_KEYS } from "./auth/index.ts";
import { ModelCatalog } from "./catalog/index.ts";
import { createApp } from "./app.ts";
import { runTui } from "./tui/index.ts";
import { exportSession, importSession, parseSessionExport, redactExport, type RedactLevel } from "./session/serialize.ts";
import type { SessionInfo } from "./session/types.ts";
import { bold, cyan, dim, green, red, yellow } from "./util/ansi.ts";
import { createLogger } from "./util/log.ts";

const VERSION = "0.4.1";
const log = createLogger("main");

function installCrashGuards(): void {
  process.on("unhandledRejection", (reason) => {
    log.error("unhandledRejection", { reason: reason instanceof Error ? (reason.stack ?? reason.message) : String(reason) });
  });
  process.on("uncaughtException", (error) => {
    log.error("uncaughtException", { error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
    try {
      if (process.stdout.isTTY) process.stdout.write("\x1b[?1049l\x1b[?25h\x1b[0m");
    } catch {
      /* best effort */
    }
    process.exit(1);
  });
}

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

function formatSessionRow(session: SessionInfo, maxTitleLen = 40): string {
  const title = session.title.length > maxTitleLen ? session.title.slice(0, maxTitleLen - 1) + "…" : session.title.padEnd(maxTitleLen);
  const age = timeAgo(session.updated);
  const cost = session.cost != null ? `$${session.cost.toFixed(2)}` : "";
  return `${cyan(session.id.slice(-10))}  ${bold(title)}  ${dim(session.agent.padEnd(10))} ${dim(age.padStart(6))} ${dim(cost.padStart(6))}`;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

async function sessionCommand(positional: string[], flags: Map<string, string | true>): Promise<void> {
  const sub = positional[1] ?? "list";
  const app = await createApp();
  try {
    if (sub === "list" || sub === "ls") {
      const all = app.store.list();
      const limit = Number(flags.get("n")) || all.length;
      const shown = all.slice(0, limit);
      if (flags.get("format") === "json") {
        process.stdout.write(JSON.stringify(shown, null, 2) + "\n");
        return;
      }
      if (shown.length === 0) {
        console.log(dim("no sessions — start one with `coven` or `coven run -p …`"));
        return;
      }
      for (const s of shown) console.log(formatSessionRow(s));
      if (all.length > shown.length) console.log(dim(`… ${all.length - shown.length} more — use -n <N> to widen`));
      return;
    }
    if (sub === "delete" || sub === "rm") {
      const id = positional[2];
      if (!id) {
        console.error(`${red("✗")} usage: coven session delete <session-id>`);
        process.exit(1);
      }
      const target = app.store.list().find((s) => s.id === id || s.id.endsWith(id));
      if (!target) {
        console.error(`${red("✗")} no such session: ${id}`);
        process.exit(1);
      }
      app.store.delete(target.id);
      console.log(`${green("✓")} deleted ${target.id}`);
      return;
    }
    if (sub === "export") {
      const id = positional[2];
      const chosen = id
        ? app.store.list().find((s) => s.id === id || s.id.endsWith(id))
        : app.store.list()[0];
      if (!chosen) {
        console.error(`${red("✗")} ${id ? `no such session: ${id}` : "no sessions to export"}`);
        process.exit(1);
      }
      const raw = exportSession(app.store, chosen.id);
      const level = (typeof flags.get("redact") === "string" ? (flags.get("redact") as RedactLevel) : flags.get("redact") ? "text" : "off") as RedactLevel;
      const shaped = redactExport(raw, level);
      process.stdout.write(JSON.stringify(shaped, null, 2) + "\n");
      return;
    }
    if (sub === "import") {
      const file = positional[2];
      if (!file) {
        console.error(`${red("✗")} usage: coven session import <file.json>`);
        process.exit(1);
      }
      const json = readFileSync(file, "utf8");
      const exp = parseSessionExport(json);
      const newID = importSession(app.store, exp);
      console.log(`${green("✓")} imported as ${newID}`);
      return;
    }
    console.log("usage: coven session [list [--format json] [-n <N>]|delete <id>|export [id] [--redact off|text|aggressive]|import <file>]");
  } finally {
    await app.dispose();
  }
}

function detectInstallMethod(): string {
  const argv0 = process.argv[0] ?? "";
  if (argv0.includes("/bun/") || argv0.endsWith("bun")) return "bun";
  if (argv0.includes("brew")) return "brew";
  if (argv0.includes("fnm")) return "npm";
  if (process.env.npm_config_global === "true" || argv0.includes("npm")) return "npm";
  return "npm";
}

async function upgradeCommand(target: string | undefined, flags: Map<string, string | true>): Promise<void> {
  const method = (typeof flags.get("method") === "string" ? (flags.get("method") as string) : detectInstallMethod());
  const dryRun = flags.get("dry-run") === true;
  const ref = target ? `thecoven@${target}` : "thecoven@latest";
  const commands: Record<string, string[]> = {
    npm: ["npm", "install", "-g", ref],
    pnpm: ["pnpm", "add", "-g", ref],
    bun: ["bun", "add", "-g", ref],
    brew: ["brew", "upgrade", "thecoven"],
    curl: ["sh", "-c", "curl -fsSL https://coven.sh/install | sh"],
  };
  const cmd = commands[method];
  if (!cmd) {
    console.error(`${red("✗")} unknown install method: ${method}. Try --method npm|pnpm|bun|brew|curl`);
    process.exit(1);
  }
  console.log(`${cyan("→")} upgrade via ${bold(method)}: ${dim(cmd.join(" "))}`);
  if (dryRun) {
    console.log(dim("(--dry-run — not executing)"));
    return;
  }
  const result = spawnSync(cmd[0]!, cmd.slice(1), { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`${red("✗")} upgrade failed (exit ${result.status ?? "?"}). Try --method <installer> or run manually: ${cmd.join(" ")}`);
    process.exit(result.status ?? 1);
  }
  console.log(`${green("✓")} upgrade complete`);
}

function completionScript(shell: string): string {
  const cmds = "agents skills models mcp lsp auth run session upgrade completion version help";
  if (shell === "bash") {
    return `# coven bash completion — install: coven completion bash > /etc/bash_completion.d/coven
_coven() {
  local cur cmds
  cur="\${COMP_WORDS[COMP_CWORD]}"
  cmds="${cmds}"
  COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
}
complete -F _coven coven
`;
  }
  if (shell === "zsh") {
    return `# coven zsh completion — install: coven completion zsh > "\${fpath[1]}/_coven"
#compdef coven
_coven() {
  local -a cmds
  cmds=(${cmds
    .split(" ")
    .map((c) => `"${c}"`)
    .join(" ")})
  _describe 'command' cmds
}
compdef _coven coven
`;
  }
  if (shell === "fish") {
    return `# coven fish completion — install: coven completion fish > ~/.config/fish/completions/coven.fish
complete -c coven -f -a "${cmds}"
`;
  }
  return "";
}

function completionCommand(shellArg: string | undefined): void {
  const shellEnv = process.env.SHELL ?? "";
  const shell = shellArg ?? (shellEnv.includes("fish") ? "fish" : shellEnv.includes("zsh") ? "zsh" : "bash");
  const script = completionScript(shell);
  if (!script) {
    console.error(`${red("✗")} unknown shell: ${shell}. Supported: bash, zsh, fish`);
    process.exit(1);
  }
  process.stdout.write(script);
}

interface ParsedFlags {
  flags: Map<string, string | true>;
  positional: string[];
}

function parseFlags(args: string[]): ParsedFlags {
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  const takesValue = new Set([
    "prompt", "agent", "session", "model", "format", "redact", "attach", "method", "n",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "-p" || arg === "--prompt") flags.set("prompt", args[++i] ?? "");
    else if (arg === "--agent") flags.set("agent", args[++i] ?? "");
    else if (arg === "-s" || arg === "--session") flags.set("session", args[++i] ?? "");
    else if (arg === "-c" || arg === "--continue") flags.set("continue", true);
    else if (arg === "--fork") flags.set("fork", true);
    else if (arg === "--model") flags.set("model", args[++i] ?? "");
    else if (arg === "--format") flags.set("format", args[++i] ?? "");
    else if (arg === "--redact") {
      // --redact may take a value (off/text/aggressive) or be bare (defaults to text)
      const next = args[i + 1];
      if (next && !next.startsWith("-") && ["off", "text", "aggressive"].includes(next)) {
        flags.set("redact", next);
        i++;
      } else flags.set("redact", true);
    }
    else if (arg === "--attach") flags.set("attach", args[++i] ?? "");
    else if (arg === "--method") flags.set("method", args[++i] ?? "");
    else if (arg === "-n") flags.set("n", args[++i] ?? "");
    else if (arg === "--yes" || arg === "-y") flags.set("yes", true);
    else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (takesValue.has(key)) flags.set(key, args[++i] ?? "");
      else flags.set(key, true);
    }
    else positional.push(arg);
  }
  return { flags, positional };
}

interface RunOpts {
  agent?: string;
  autoYes: boolean;
  continueSession: boolean;
  sessionID?: string;
  fork: boolean;
  model?: string;
  format: "text" | "json";
  attach?: string;
}

async function runPrintMode(prompt: string, opts: RunOpts): Promise<void> {
  const app = await createApp();
  try {
    let session: SessionInfo | undefined;
    if (opts.sessionID) {
      const found = app.store.list().find((s) => s.id === opts.sessionID || s.id.endsWith(opts.sessionID!));
      if (!found) {
        console.error(`${red("✗")} no such session: ${opts.sessionID}`);
        process.exit(1);
      }
      session = found;
    } else if (opts.continueSession) {
      session = app.store.list()[0];
      if (!session) {
        console.error(`${red("✗")} no sessions to continue`);
        process.exit(1);
      }
    }
    if (opts.fork && session) {
      const raw = exportSession(app.store, session.id);
      const newID = importSession(app.store, raw);
      session = app.store.get(newID);
    }
    if (!session) {
      const agent = opts.agent ?? app.loaded.config.default_agent ?? "builder";
      if (!app.agents.get(agent)) {
        console.error(`${red("✗")} no agent "${agent}"`);
        process.exit(1);
      }
      session = app.store.create({ agent });
    }
    if (opts.model) {
      session.model = opts.model;
      app.store.update(session);
    }

    const jsonMode = opts.format === "json";

    app.bus.subscribe((event) => {
      if (event.type === "permission.asked") {
        if (opts.autoYes) app.permissions.reply(event.request.id, "once");
        else {
          console.error(`${yellow("⚠")} auto-rejected: ${event.request.permission} → ${event.request.patterns.join(", ")} (use --yes)`);
          app.permissions.reply(event.request.id, "reject", "Non-interactive run without --yes: action not permitted.");
        }
      }
      if (jsonMode) {
        if (
          event.type === "part.delta" ||
          event.type === "part.updated" ||
          event.type === "tool.started" ||
          event.type === "tool.finished" ||
          event.type === "message.updated" ||
          event.type === "session.status"
        ) {
          process.stdout.write(JSON.stringify(event) + "\n");
        }
        return;
      }
      if (event.type === "part.delta") process.stdout.write(event.delta);
      if (event.type === "tool.finished") process.stderr.write(`${dim(`[${event.tool}]`)}\n`);
    });

    const abort = new AbortController();
    process.on("SIGINT", () => abort.abort());
    await app.engine.prompt(session.id, prompt, abort.signal);
    if (!jsonMode) process.stdout.write("\n");
    if (jsonMode) process.stdout.write(JSON.stringify({ type: "run.done", sessionID: session.id }) + "\n");
  } finally {
    await app.dispose();
  }
}

async function main(): Promise<void> {
  installCrashGuards();
  const { flags, positional } = parseFlags(process.argv.slice(2));
  const command = positional[0];

  if (flags.has("version") || command === "version") {
    console.log(`coven ${VERSION}`);
    return;
  }
  if (flags.has("help") || command === "help") {
    console.log(`${bold("coven")} ${VERSION} — a coven of coding agents in your terminal

Usage:
  coven                                interactive TUI
  coven --continue                     resume most recent session in TUI
  coven --session <id>                 open a specific session in TUI
  coven run -p "<prompt>"              one-shot mode
  coven run -p "<p>" -c                append to most recent session
  coven run -p "<p>" -s <id>           append to a specific session
  coven run -p "<p>" --fork -s <id>    fork a session, then prompt on the copy
  coven run -p "<p>" --format json     emit structured event lines to stdout
  coven agents                         list agents
  coven skills                         list skills
  coven models [provider]              browse the model catalog
  coven auth login <provider>          store an API key (BYOK)
  coven session list [-n N] [--format json]   list sessions
  coven session delete <id>            delete a session
  coven session export [id] [--redact off|text|aggressive]   export as JSON
  coven session import <file.json>     import from JSON
  coven upgrade [version] [--method npm|pnpm|bun|brew|curl] [--dry-run]
  coven completion [bash|zsh|fish]     emit shell completion script

Config: coven.json (project) / ~/.config/coven/coven.json (global)
Keys:   env vars (ANTHROPIC_API_KEY, …) or coven auth login
Voice:  /voice in the TUI (say / espeak / piper / PowerShell / OpenAI TTS)`);
    return;
  }

  if (command === "agents") {
    const app = await createApp();
    try {
      for (const agent of app.agents.all().filter((a) => !a.hidden)) {
        console.log(`${green("●")} ${bold(agent.name.padEnd(12))} ${dim(`[${agent.mode}]`)} ${agent.description}`);
      }
    } finally {
      await app.dispose();
    }
    return;
  }
  if (command === "skills") {
    const app = await createApp();
    try {
      const skills = app.skills.all();
      if (skills.length === 0) console.log(dim("no skills discovered (.coven/skills, .claude/skills, ~/.config/coven/skills)"));
      for (const skill of skills) console.log(`${yellow("◆")} ${bold(skill.name)} — ${skill.description}`);
    } finally {
      await app.dispose();
    }
    return;
  }
  if (command === "mcp") {
    const app = await createApp();
    try {
      const servers = app.mcp?.servers() ?? [];
      if (servers.length === 0) {
        console.log(dim('no MCP servers configured — add an "mcp" block to coven.json'));
        return;
      }
      for (const s of servers) {
        const mark = s.state === "ready" ? green("●") : s.state === "error" ? red("✗") : yellow("…");
        const detail = [s.transport, s.state, s.state === "ready" ? `${s.toolCount} tools` : "", s.error ?? ""]
          .filter(Boolean)
          .join(" · ");
        console.log(`${mark} ${bold(s.name.padEnd(16))} ${dim(detail)}`);
      }
      for (const tool of app.mcp?.toolDefs() ?? []) console.log(`  ${cyan("→")} ${tool.id}`);
    } finally {
      await app.dispose();
    }
    return;
  }
  if (command === "lsp") {
    const app = await createApp();
    try {
      const servers = app.lsp?.status() ?? [];
      if (servers.length === 0) {
        console.log(dim('no LSP servers configured — add an "lsp" block to coven.json'));
        return;
      }
      for (const s of servers) {
        const mark = s.state === "ready" ? green("●") : s.state === "error" ? red("✗") : yellow("…");
        console.log(`${mark} ${bold(s.language.padEnd(14))} ${dim(`${s.command} · ${s.state}${s.error ? ` · ${s.error}` : ""}`)}`);
      }
    } finally {
      await app.dispose();
    }
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
  if (command === "session") {
    await sessionCommand(positional, flags);
    return;
  }
  if (command === "upgrade") {
    await upgradeCommand(positional[1], flags);
    return;
  }
  if (command === "completion") {
    completionCommand(positional[1]);
    return;
  }
  if (command === "run") {
    const prompt = flags.get("prompt");
    if (typeof prompt !== "string" || !prompt) {
      console.error(`${red("✗")} coven run requires -p "<prompt>"`);
      process.exit(1);
    }
    const format = (flags.get("format") === "json" ? "json" : "text") as "text" | "json";
    await runPrintMode(prompt, {
      agent: typeof flags.get("agent") === "string" ? (flags.get("agent") as string) : undefined,
      autoYes: flags.get("yes") === true,
      continueSession: flags.get("continue") === true,
      sessionID: typeof flags.get("session") === "string" ? (flags.get("session") as string) : undefined,
      fork: flags.get("fork") === true,
      model: typeof flags.get("model") === "string" ? (flags.get("model") as string) : undefined,
      format,
      attach: typeof flags.get("attach") === "string" ? (flags.get("attach") as string) : undefined,
    });
    return;
  }

  // Default: TUI, optionally resuming a session.
  const app = await createApp();
  try {
    let initialSessionID: string | undefined;
    if (typeof flags.get("session") === "string") {
      initialSessionID = flags.get("session") as string;
    } else if (flags.get("continue")) {
      initialSessionID = app.store.list()[0]?.id;
    }
    await runTui(app, { initialSessionID });
  } finally {
    await app.dispose();
  }
}

main().catch((error) => {
  const named = error instanceof Error && /^(Provider|Permission|Config|Catalog)Error$/.test(error.name);
  if (named) console.error(`${red("coven fatal:")} ${error.message}`);
  else console.error(`${red("coven fatal:")} ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});

export { parseFlags, formatSessionRow, completionScript, detectInstallMethod };
