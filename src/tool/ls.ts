import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "./types.ts";
import { resolvePath } from "./path.ts";

const IGNORED = new Set(["node_modules", ".git", "dist", ".cache", "__pycache__"]);

export const lsTool = defineTool({
  id: "ls",
  description: "List files and directories at a path (directories suffixed with /). Skips node_modules, .git, dist.",
  parameters: z.object({
    path: z.string().optional().describe("Directory to list (defaults to workspace root)"),
  }),
  async execute(args, ctx) {
    const path = resolvePath(ctx.root, args.path ?? ".");
    await ctx.ask({
      permission: path.external ? "external_directory" : "read",
      patterns: [path.display],
      title: `List ${path.display}`,
    });
    const entries = readdirSync(path.absolute)
      .filter((name) => !IGNORED.has(name))
      .sort()
      .map((name) => {
        try {
          return statSync(join(path.absolute, name)).isDirectory() ? `${name}/` : name;
        } catch {
          return name;
        }
      });
    return {
      title: path.display,
      output: entries.length > 0 ? entries.join("\n") : "(empty)",
      metadata: { count: entries.length },
    };
  },
});
