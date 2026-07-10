import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";
import { scanBashCommand } from "./bash-scan.ts";
import { spawnCapture } from "../util/proc.ts";

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TIMEOUT_MS = 600_000;

export const bashTool = defineTool({
  id: "bash",
  description:
    "Execute a shell command in the workspace root. Use dedicated tools (read/write/edit/grep/glob) instead of cat/sed/echo where possible. Timeout in ms (default 120000, max 600000).",
  parameters: z.object({
    command: z.string().describe("The command to execute"),
    timeout: z.number().int().positive().max(MAX_TIMEOUT_MS).optional(),
    description: z.string().optional().describe("One-line description of what this does"),
  }),
  async execute(args, ctx) {
    const scan = scanBashCommand(args.command);
    await ctx.ask({
      permission: "bash",
      // Dangerous shapes ask under a pattern no sane allow-rule matches.
      patterns: scan.dangerous ? [`dangerous: ${args.command.slice(0, 80)}`] : scan.patterns,
      title: args.description ?? args.command.slice(0, 100),
      metadata: { command: args.command, dangerous: scan.dangerous },
    });

    ctx.progress(args.command.slice(0, 60));
    const result = await spawnCapture(["bash", "-c", args.command], {
      cwd: ctx.root,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      timeoutMs: Math.min(args.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS),
      signal: ctx.abort,
    });

    let output = "";
    if (result.stdout) output += result.stdout;
    if (result.stderr) output += (output ? "\n--- stderr ---\n" : "") + result.stderr;
    if (result.timedOut) output += "\n(killed: timeout exceeded)";
    else if (result.exitCode !== 0) output += `\n(exit code ${result.exitCode})`;
    return {
      title: args.description ?? args.command.slice(0, 100),
      output: truncateOutput(output.trim() || "(no output)"),
      metadata: { exitCode: result.exitCode },
    };
  },
});
