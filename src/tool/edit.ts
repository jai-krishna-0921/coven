import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { defineTool } from "./types.ts";
import { resolvePath } from "./path.ts";

export const editTool = defineTool({
  id: "edit",
  description:
    "Replace an exact string in a file. oldString must match exactly (including whitespace) and be unique in the file unless replaceAll is set.",
  parameters: z.object({
    filePath: z.string().describe("Path to the file to modify"),
    oldString: z.string().describe("Exact text to find"),
    newString: z.string().describe("Replacement text (must differ from oldString)"),
    replaceAll: z.boolean().optional().describe("Replace every occurrence instead of requiring uniqueness"),
  }),
  async execute(args, ctx) {
    if (args.oldString === args.newString) {
      return { title: args.filePath, output: "Error: oldString and newString are identical." };
    }
    const path = resolvePath(ctx.root, args.filePath);
    await ctx.ask({
      permission: path.external ? "external_directory" : "edit",
      patterns: [path.display],
      title: `Edit ${path.display}`,
    });

    const content = readFileSync(path.absolute, "utf8");
    const count = content.split(args.oldString).length - 1;
    if (count === 0) {
      return { title: path.display, output: `Error: oldString not found in ${path.display}. Read the file and match exactly.` };
    }
    if (count > 1 && !args.replaceAll) {
      return {
        title: path.display,
        output: `Error: oldString matches ${count} times in ${path.display}. Add surrounding context to make it unique, or set replaceAll.`,
      };
    }
    const updated = args.replaceAll
      ? content.split(args.oldString).join(args.newString)
      : content.replace(args.oldString, args.newString);
    ctx.captureFile?.(path.absolute);
    writeFileSync(path.absolute, updated, "utf8");
    return {
      title: path.display,
      output: `Edited ${path.display} (${args.replaceAll ? count : 1} replacement${count > 1 && args.replaceAll ? "s" : ""})`,
    };
  },
});
