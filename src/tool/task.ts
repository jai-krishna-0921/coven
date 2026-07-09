import { z } from "zod";
import { defineTool } from "./types.ts";

/**
 * The task tool — subagent spawning. A subagent is a child session with its own
 * agent (system prompt + permission ruleset + model), run to completion; its
 * final text is returned as this tool's output. The actual spawner is injected
 * by the session layer (ctx.spawnSubagent) to avoid a circular dependency.
 */
export const taskTool = defineTool({
  id: "task",
  description:
    "Dispatch a subagent to handle a delegated task. The subagent runs in its own session and returns its final report. Use the right specialist (see the agent list in your system prompt). The prompt must be self-contained: the subagent does not see this conversation.",
  parameters: z.object({
    subagent: z.string().describe("Name of the agent to dispatch (e.g. researcher, builder, reviewer)"),
    description: z.string().describe("Short 3-6 word summary of the task"),
    prompt: z.string().describe("Complete, self-contained task brief for the subagent"),
  }),
  async execute(args, ctx) {
    if (!ctx.spawnSubagent) {
      return { title: args.description, output: "Error: subagent spawning is not available in this context." };
    }
    await ctx.ask({
      permission: "task",
      patterns: [args.subagent],
      title: `Dispatch ${args.subagent}: ${args.description}`,
    });
    ctx.progress(`${args.subagent}: ${args.description}`);
    const report = await ctx.spawnSubagent({ agent: args.subagent, prompt: args.prompt, description: args.description });
    return {
      title: `${args.subagent}: ${args.description}`,
      output: `<subagent_report agent="${args.subagent}">\n${report}\n</subagent_report>`,
    };
  },
});
