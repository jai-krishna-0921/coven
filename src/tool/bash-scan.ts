/**
 * Bash command scanner — extracts the command heads from a shell command line
 * so the permission engine can match rules like "git status": "allow" or
 * "rm *": "ask". Handles ;, &&, ||, |, & separators, quoting, $()/backtick
 * substitution, and env-var prefixes. Conservative by design: anything we
 * cannot confidently parse yields the pattern "<complex>" which no allow-rule
 * should match (→ falls back to ask).
 */

/** Commands where the subcommand matters for permissioning (git push vs git status). */
const SUBCOMMAND_AWARE = new Set([
  "git",
  "gh",
  "bun",
  "bunx",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "cargo",
  "go",
  "docker",
  "kubectl",
  "systemctl",
]);

/** Wrappers whose real command follows: `env FOO=1 cmd`, `xargs cmd`, … */
const WRAPPERS = new Set(["env", "xargs", "nohup", "timeout", "nice", "stdbuf", "time"]);

const DANGEROUS_ALWAYS_ASK = [
  /\brm\s+(-[a-z]*[rf][a-z]*\s+)+/i, // rm -r / rm -f variants
  /\bgit\s+push\s+.*(--force|-f)\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bchmod\s+-R\b/,
  /\bsudo\b/,
  /\bcurl\b[^|]*\|\s*(ba)?sh\b/, // curl | sh
  /\bwget\b[^|]*\|\s*(ba)?sh\b/,
  /\bdd\b.*\bof=\/dev\//,
  /\bmkfs\b/,
  />\s*\/dev\/sd[a-z]\b/,
];

export interface BashScan {
  /** Permission patterns, e.g. ["git status", "grep"]. */
  patterns: string[];
  /** True when the command matches a known-dangerous shape — always ask, never auto-allow. */
  dangerous: boolean;
}

function splitStatements(command: string): string[] {
  const statements: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let depth = 0;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!;
    const next = command[i + 1];
    if (quote) {
      current += ch;
      if (ch === quote && command[i - 1] !== "\\") quote = undefined;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "$" && next === "(") {
      depth++;
      current += ch;
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth--;
      current += ch;
      continue;
    }
    if (depth === 0 && (ch === ";" || ch === "|" || ch === "&" || ch === "\n")) {
      if ((ch === "|" && next === "|") || (ch === "&" && next === "&")) i++;
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function headOf(statement: string): string {
  let words = statement.split(/\s+/).filter(Boolean);
  // Strip VAR=value assignments and wrappers repeatedly — they interleave
  // (`FOO=1 env BAR=2 node …` must reduce to `node`).
  let changed = true;
  while (changed) {
    changed = false;
    while (words.length > 0 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) {
      words = words.slice(1);
      changed = true;
    }
    if (words.length > 1 && WRAPPERS.has(words[0]!)) {
      words = words.slice(1);
      changed = true;
    }
  }
  const first = words[0];
  if (!first) return "<complex>";
  if (/[`$<>{}]/.test(first)) return "<complex>";
  const base = first.split("/").pop()!;
  if (SUBCOMMAND_AWARE.has(base)) {
    const sub = words[1];
    if (sub && /^[a-z][a-z0-9:_-]*$/i.test(sub)) return `${base} ${sub}`;
  }
  return base;
}

export function scanBashCommand(command: string): BashScan {
  const dangerous = DANGEROUS_ALWAYS_ASK.some((regex) => regex.test(command));
  // Command substitution bodies are commands too — scan them as statements.
  const expanded = command.replace(/\$\(([^)]*)\)/g, (_m, inner: string) => `; ${inner} ;`).replace(/`([^`]*)`/g, "; $1 ;");
  const heads = splitStatements(expanded).map(headOf);
  const patterns = [...new Set(heads)];
  return { patterns: patterns.length > 0 ? patterns : ["<complex>"], dangerous };
}
