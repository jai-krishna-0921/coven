/**
 * `question` tool — pauses the turn to ask the user a multi-choice question.
 * Complementary to permission asks: permissions gate destructive actions,
 * questions gather decisions.
 */
import { z } from "zod";
import { defineTool } from "./types.ts";

export const questionTool = defineTool({
  id: "question",
  description:
    "Ask the user a question with predefined choices. Use when you need a decision the code can't infer — e.g. picking between designs, confirming intent when multiple interpretations are viable. Returns the user's answer(s) as text.",
  parameters: z.object({
    title: z.string().min(1).describe("One-line question to display."),
    choices: z.array(z.string().min(1)).describe("Answer options. May be empty when allow_custom=true."),
    allow_custom: z.boolean().optional().describe("Allow a free-text 'other' answer (default false)."),
    allow_multiple: z.boolean().optional().describe("Allow selecting more than one choice (default false)."),
  }),
  async execute(args, ctx) {
    if (!ctx.askQuestion) {
      return {
        title: args.title,
        output: "Error: question tool is not available in this run (no UI to answer).",
        metadata: { isError: true },
      };
    }
    try {
      const values = await ctx.askQuestion({
        title: args.title,
        choices: args.choices,
        allowCustom: args.allow_custom,
        allowMultiple: args.allow_multiple,
      });
      const output = values.length === 0 ? "(no selection)" : values.join(", ");
      return { title: args.title, output };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { title: args.title, output: `User cancelled: ${message}`, metadata: { isError: true } };
    }
  },
});
