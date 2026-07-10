import { z } from "zod";
import { statSync } from "node:fs";
import { join } from "node:path";
import { defineTool, truncateOutput } from "./types.ts";
import { resolvePath } from "./path.ts";
import { globScan } from "../util/glob.ts";

export const globTool = defineTool({
  id: "glob",
  description:
    'Find files by glob pattern (e.g. "**/*.ts", "src/**/config*"). Results sorted by modification time, newest first.',
  parameters: z.object({
    pattern: z.string().describe("Glob pattern"),
    path: z.string().optional().describe("Directory to search in (defaults to workspace root)"),
  }),
  async execute(args, ctx) {
    const base = resolvePath(ctx.root, args.path ?? ".");
    await ctx.ask({
      permission: base.external ? "external_directory" : "read",
      patterns: [base.display],
      title: `Glob ${args.pattern}`,
    });
    const matches = globScan(base.absolute, args.pattern, 1000).map((path) => {
      let mtime = 0;
      try {
        mtime = statSync(join(base.absolute, path)).mtimeMs;
      } catch {
        // File may have vanished mid-scan; keep it with mtime 0.
      }
      return { path, mtime };
    });
    matches.sort((a, b) => b.mtime - a.mtime);
    const output = matches.map((m) => m.path).join("\n");
    return {
      title: args.pattern,
      output: matches.length > 0 ? truncateOutput(output) : "No files matched.",
      metadata: { count: matches.length },
    };
  },
});
