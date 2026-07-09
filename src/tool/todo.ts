import { z } from "zod";
import { defineTool } from "./types.ts";

const TodoItem = z.object({
  content: z.string().describe("The task, imperative form"),
  status: z.enum(["pending", "in_progress", "completed"]),
});

/** Per-session todo state, read by the TUI status line. */
export const todoState = new Map<string, z.infer<typeof TodoItem>[]>();

export const todoTool = defineTool({
  id: "todo",
  description:
    "Replace the session todo list. Use for multi-step work: plan the steps, mark exactly one in_progress at a time, mark completed immediately when done.",
  parameters: z.object({
    todos: z.array(TodoItem).describe("The complete todo list (replaces the previous list)"),
  }),
  async execute(args, ctx) {
    todoState.set(ctx.sessionID, args.todos);
    const remaining = args.todos.filter((todo) => todo.status !== "completed").length;
    const lines = args.todos.map((todo) => {
      const mark = todo.status === "completed" ? "[x]" : todo.status === "in_progress" ? "[~]" : "[ ]";
      return `${mark} ${todo.content}`;
    });
    return {
      title: `${args.todos.length - remaining}/${args.todos.length} done`,
      output: lines.join("\n"),
      metadata: { remaining },
    };
  },
});
