import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";
import { resolvePath } from "./path.ts";

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

    const proc = Bun.spawnSync(["rg", ...rgArgs], { stdout: "pipe", stderr: "pipe" });
    if (proc.exitCode === 0 || proc.exitCode === 1) {
      const raw = proc.stdout.toString();
      const lines = raw
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

    // Fallback: JS scan (rg not installed or errored).
    const regex = new RegExp(args.pattern, args.ignoreCase ? "i" : "");
    const glob = new Bun.Glob(args.glob ?? "**/*");
    const results: string[] = [];
    for await (const file of glob.scan({ cwd: base.absolute, dot: false })) {
      if (file.includes("node_modules/") || file.startsWith(".git/")) continue;
      try {
        const text = await Bun.file(`${base.absolute}/${file}`).text();
        const lines = text.split("\n");
        for (let i = 0; i < lines.length && results.length < 200; i++) {
          if (regex.test(lines[i]!)) results.push(`${file}:${i + 1}:${lines[i]!.slice(0, 300)}`);
        }
      } catch {
        // Binary or unreadable file — skip.
      }
      if (results.length >= 200) break;
    }
    return {
      title: args.pattern,
      output: results.length > 0 ? truncateOutput(results.join("\n")) : "No matches.",
      metadata: { matches: results.length, engine: "js" },
    };
  },
});
