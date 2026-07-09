import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";
import { resolvePath } from "./path.ts";

const DEFAULT_LIMIT = 2000;
const MAX_LINE_LENGTH = 2000;

export const readTool = defineTool({
  id: "read",
  description:
    "Read a file from the filesystem. Returns line-numbered content. Use offset/limit for large files. Prefer this over bash cat/head/tail.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file (absolute or relative to workspace root)"),
    offset: z.number().int().min(1).optional().describe("1-based line number to start from"),
    limit: z.number().int().min(1).optional().describe("Maximum number of lines to read"),
  }),
  async execute(args, ctx) {
    const path = resolvePath(ctx.root, args.filePath);
    await ctx.ask({
      permission: path.external ? "external_directory" : "read",
      patterns: [path.display],
      title: `Read ${path.display}`,
    });

    const stat = statSync(path.absolute);
    if (stat.isDirectory()) {
      return { title: path.display, output: `EISDIR: ${path.display} is a directory — use the ls tool.` };
    }
    if (stat.size > 10 * 1024 * 1024) {
      return { title: path.display, output: `File too large (${stat.size} bytes). Use offset/limit or grep.` };
    }

    const lines = readFileSync(path.absolute, "utf8").split("\n");
    const offset = args.offset ?? 1;
    const limit = args.limit ?? DEFAULT_LIMIT;
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    const numbered = slice
      .map((line, index) => {
        const trimmed = line.length > MAX_LINE_LENGTH ? line.slice(0, MAX_LINE_LENGTH) + "…" : line;
        return `${String(offset + index).padStart(5)}→${trimmed}`;
      })
      .join("\n");
    const remaining = lines.length - (offset - 1 + slice.length);
    const footer = remaining > 0 ? `\n\n(${remaining} more lines — use offset=${offset + slice.length} to continue)` : "";
    return { title: path.display, output: truncateOutput(numbered + footer), metadata: { lines: lines.length } };
  },
});
