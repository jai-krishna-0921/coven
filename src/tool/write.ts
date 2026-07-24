import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "./types.ts";
import { resolvePath } from "./path.ts";

export const writeTool = defineTool({
  id: "write",
  description: "Write content to a file, creating it (and parent directories) if needed, overwriting if it exists.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file (absolute or relative to workspace root)"),
    content: z.string().describe("Full content to write"),
  }),
  async execute(args, ctx) {
    const path = resolvePath(ctx.root, args.filePath);
    const exists = existsSync(path.absolute);
    await ctx.ask({
      permission: path.external ? "external_directory" : "edit",
      patterns: [path.display],
      title: `${exists ? "Overwrite" : "Create"} ${path.display}`,
      metadata: exists ? { diffOf: readFileSync(path.absolute, "utf8").length } : {},
    });
    ctx.captureFile?.(path.absolute);
    mkdirSync(dirname(path.absolute), { recursive: true });
    writeFileSync(path.absolute, args.content, "utf8");
    const lines = args.content.split("\n").length;
    return { title: path.display, output: `${exists ? "Overwrote" : "Created"} ${path.display} (${lines} lines)` };
  },
});
