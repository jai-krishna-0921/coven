import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";
import { scanBashCommand } from "./bash-scan.ts";

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
    const proc = Bun.spawn(["bash", "-c", args.command], {
      cwd: ctx.root,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const timeout = Math.min(args.timeout ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => proc.kill(9), timeout);
    const onAbort = () => proc.kill(9);
    ctx.abort.addEventListener("abort", onAbort, { once: true });

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      let output = "";
      if (stdout) output += stdout;
      if (stderr) output += (output ? "\n--- stderr ---\n" : "") + stderr;
      if (exitCode !== 0) output += `\n(exit code ${exitCode})`;
      return {
        title: args.description ?? args.command.slice(0, 100),
        output: truncateOutput(output.trim() || "(no output)"),
        metadata: { exitCode },
      };
    } finally {
      clearTimeout(timer);
      ctx.abort.removeEventListener("abort", onAbort);
    }
  },
});
