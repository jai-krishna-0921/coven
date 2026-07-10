/**
 * Slash command registry: builtins ← global config commands ← project commands.
 * Later sources win on name collisions. Templates expand with OpenCode-parity
 * semantics: $1..$N positionals (highest absorbs the rest), $ARGUMENTS,
 * !`cmd` shell injection, and @file attachments.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { globScan } from "../util/glob.ts";
import { createLogger } from "../util/log.ts";
import { readAttachment } from "../util/path.ts";
import { spawnCapture } from "../util/proc.ts";
import { BUILTIN_COMMANDS } from "./builtin.ts";
import type { CommandDef, CommandSource } from "./types.ts";

const log = createLogger("command");

/** Tokenizer for command arguments: quoted spans stay together, quotes stripped. */
const ARGS_REGEX = /(?:"[^"]*"|'[^']*'|[^\s"']+)/g;
const QUOTE_TRIM_REGEX = /^["']|["']$/g;
/** $1..$N positional placeholders. */
const PLACEHOLDER_REGEX = /\$(\d+)/g;
/** !`cmd` shell injection. */
const SHELL_REGEX = /!`([^`]+)`/g;
/** @path file references (lookbehind avoids emails and `@code` spans). */
const FILE_REGEX = /(?<![\w`])@([\w./-]+)/g;

const MAX_ATTACH_FILE_BYTES = 200 * 1024;
const MAX_ATTACH_CONTENT_CHARS = 20_000;
const SHELL_TIMEOUT_MS = 30_000;

/** Placeholders ($1..$N, $ARGUMENTS) in order of first appearance, deduped. */
export function extractHints(template: string): string[] {
  const hints: string[] = [];
  for (const match of template.matchAll(/\$(?:ARGUMENTS|\d+)/g)) {
    if (!hints.includes(match[0])) hints.push(match[0]);
  }
  return hints;
}

function parseCommandFile(dir: string, rel: string, source: CommandSource): CommandDef {
  const { data, body } = parseFrontmatter(readFileSync(join(dir, rel), "utf8"));
  const name = rel.replace(/\.md$/, "");
  const template = body.trim();
  return {
    name,
    description: data["description"] ?? `Custom command /${name}`,
    template,
    agent: data["agent"],
    model: data["model"],
    subtask: data["subtask"] === undefined ? undefined : data["subtask"] === "true",
    source,
    hints: extractHints(template),
  };
}

export class CommandRegistry {
  private commands = new Map<string, CommandDef>();

  static async load(root: string, globalConfigDir?: string): Promise<CommandRegistry> {
    const registry = new CommandRegistry();
    for (const def of BUILTIN_COMMANDS) registry.commands.set(def.name, { ...def, hints: [...def.hints] });

    const globalDir = globalConfigDir ?? join(homedir(), ".config", "coven");
    const sources: Array<{ dir: string; source: CommandSource }> = [
      { dir: join(globalDir, "commands"), source: "global" },
      { dir: join(root, ".coven", "commands"), source: "project" },
    ];
    for (const { dir, source } of sources) {
      if (!existsSync(dir)) continue;
      for (const rel of globScan(dir, "**/*.md").sort()) {
        try {
          const def = parseCommandFile(dir, rel, source);
          registry.commands.set(def.name, def);
        } catch (error) {
          log.warn("failed to load command file", { dir, file: rel, error: String(error) });
        }
      }
    }
    return registry;
  }

  get(name: string): CommandDef | undefined {
    return this.commands.get(name);
  }

  all(): CommandDef[] {
    return [...this.commands.values()];
  }

  /**
   * Expand a command template with arguments, shell injections, and file attachments.
   *
   * Security: `` !`cmd` `` shell injection runs a command BEFORE the model sees
   * anything, so it is gated behind `opts.gateShell`. Absent that callback (or
   * when it returns false), the injection is refused — a project-supplied
   * command from a cloned repo cannot silently run code. `@file` attachments are
   * containment- and secret-checked (readAttachment); a traversal or a key file
   * yields no attachment.
   */
  async expand(
    def: CommandDef,
    rawArgs: string,
    opts: { root: string; gateShell?: (command: string) => Promise<boolean> },
  ): Promise<string> {
    let text = def.template;

    // 1. Tokenize arguments: quoted spans are single args, surrounding quotes stripped.
    const args = (rawArgs.match(ARGS_REGEX) ?? []).map((token) => token.replace(QUOTE_TRIM_REGEX, ""));

    // 2. Positional placeholders — the highest-numbered one absorbs all remaining args.
    const numbers = [...text.matchAll(PLACEHOLDER_REGEX)].map((match) => Number(match[1]));
    const hasPositional = numbers.length > 0;
    if (hasPositional) {
      const highest = Math.max(...numbers);
      text = text.replace(PLACEHOLDER_REGEX, (_full, digits: string) => {
        const index = Number(digits);
        if (index === highest) return args.slice(index - 1).join(" ");
        return args[index - 1] ?? "";
      });
    }

    // 3. $ARGUMENTS — raw argument string verbatim.
    const hasArguments = def.template.includes("$ARGUMENTS");
    if (hasArguments) text = text.replaceAll("$ARGUMENTS", rawArgs);

    // 4. No placeholders at all but args given — append them.
    if (!hasPositional && !hasArguments && rawArgs.trim().length > 0) {
      text = `${text}\n\n${rawArgs}`;
    }

    // 5. Shell injection: !`cmd` → trimmed stdout — but ONLY if the caller
    //    gates it. No gate → refuse (a cloned repo cannot run code silently).
    const shellOutputs = new Map<string, string>();
    for (const match of text.matchAll(SHELL_REGEX)) {
      if (shellOutputs.has(match[0])) continue;
      const command = match[1]!;
      const allowed = opts.gateShell ? await opts.gateShell(command) : false;
      if (!allowed) {
        shellOutputs.set(match[0], "[shell command blocked — not permitted]");
        continue;
      }
      const result = await spawnCapture(["bash", "-c", command], { cwd: opts.root, timeoutMs: SHELL_TIMEOUT_MS });
      shellOutputs.set(
        match[0],
        result.exitCode === 0 && !result.timedOut ? result.stdout.trim() : `[command failed: exit ${result.exitCode}]`,
      );
    }
    if (shellOutputs.size > 0) text = text.replace(SHELL_REGEX, (full) => shellOutputs.get(full) ?? full);

    // 6. File references: contained, non-sensitive, ≤ 200KB files get an
    //    attachment block; traversal (@../../.ssh/id_rsa) and secrets are refused.
    const attached = new Set<string>();
    let attachments = "";
    for (const match of text.matchAll(FILE_REGEX)) {
      const path = match[1]!;
      if (attached.has(path)) continue;
      attached.add(path);
      const attachment = readAttachment(opts.root, path, MAX_ATTACH_FILE_BYTES, MAX_ATTACH_CONTENT_CHARS);
      if (attachment) attachments += `\n\n<attached-file path="${path}">\n${attachment.content}\n</attached-file>`;
    }
    return text + attachments;
  }
}
