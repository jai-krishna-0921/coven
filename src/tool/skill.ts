import { z } from "zod";
import { defineTool, truncateOutput } from "./types.ts";

/**
 * The skill tool — progressive disclosure. Skill names + descriptions live in
 * the system prompt; the body is loaded on demand here. Loader injected by the
 * session layer (ctx.loadSkill).
 */
export const skillTool = defineTool({
  id: "skill",
  description:
    "Load a skill by name. Skills are listed under <available_skills> in your system prompt. Invoke the relevant skill BEFORE starting work it applies to, then follow it exactly.",
  parameters: z.object({
    name: z.string().describe("Skill name exactly as listed in <available_skills>"),
  }),
  async execute(args, ctx) {
    if (!ctx.loadSkill) {
      return { title: args.name, output: "Error: skills are not available in this context." };
    }
    await ctx.ask({ permission: "skill", patterns: [args.name], title: `Load skill: ${args.name}` });
    const skill = ctx.loadSkill(args.name);
    if (!skill) {
      return { title: args.name, output: `Error: no skill named "${args.name}". Check <available_skills> for exact names.` };
    }
    return {
      title: args.name,
      output: truncateOutput(`<skill name="${args.name}" dir="${skill.dir}">\n${skill.content}\n</skill>\n\nFollow this skill exactly. If it has a checklist, track each item.`),
    };
  },
});
