import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";
import { resolvePath } from "./path.ts";
import { globScan } from "../util/glob.ts";
import { spawnCapture } from "../util/proc.ts";

export const grepTool = defineTool({
  id: "grep",
  description:
    "Search file contents with a regex (ripgrep if available, otherwise a JS fallback). Returns file:line:content matches.",
  parameters: z.object({
    pattern: z.string().describe("Regular expression to search for"),
    path: z.string().optional().describe("Directory or file to search (defaults to workspace root)"),
    glob: z.string().optional().describe('Filter files by glob, e.g. "*.ts"'),
    ignoreCase: z.boolean().optional(),
  }),
  async execute(args, ctx) {
    const base = resolvePath(ctx.root, args.path ?? ".");
    await ctx.ask({
      permission: base.external ? "external_directory" : "read",
      patterns: [base.display],
      title: `Grep /${args.pattern}/`,
    });

    // Prefer ripgrep — dramatically faster and .gitignore-aware.
    const rgArgs = ["--line-number", "--no-heading", "--max-count", "20", "--max-columns", "300"];
    if (args.ignoreCase) rgArgs.push("--ignore-case");
    if (args.glob) rgArgs.push("--glob", args.glob);
    rgArgs.push("--regexp", args.pattern, base.absolute);

    const rg = await spawnCapture(["rg", ...rgArgs], { signal: ctx.abort, timeoutMs: 30_000 });
    if (rg.exitCode === 0 || rg.exitCode === 1) {
      const lines = rg.stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => (line.startsWith(base.absolute) ? line.slice(base.absolute.length + 1) : line))
        .slice(0, 200);
      return {
        title: args.pattern,
        output: lines.length > 0 ? truncateOutput(lines.join("\n")) : "No matches.",
        metadata: { matches: lines.length, engine: "ripgrep" },
      };
    }

    // Fallback: JS scan (rg not installed — exit 127 — or errored).
    const regex = new RegExp(args.pattern, args.ignoreCase ? "i" : "");
    const files = globScan(base.absolute, args.glob ?? "**/*", 5000);
    const results: string[] = [];
    for (const file of files) {
      if (results.length >= 200) break;
      try {
        const text = readFileSync(join(base.absolute, file), "utf8");
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && results.length < 200; i++) {
          if (regex.test(lines[i]!)) results.push(`${file}:${i + 1}:${lines[i]!.slice(0, 300)}`);
        }
      } catch {
        // Binary or unreadable file — skip.
      }
    }
    return {
      title: args.pattern,
      output: results.length > 0 ? truncateOutput(results.join("\n")) : "No matches.",
      metadata: { matches: results.length, engine: "js" },
    };
  },
});
