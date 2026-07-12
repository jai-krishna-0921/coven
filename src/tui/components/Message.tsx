/**
 * Renders one transcript message. User messages are shown as a single
 * prompt-prefixed line; assistant messages map each part by `type`:
 * text → Markdown, reasoning → dim text, tool → ToolLine (or Diff for edits).
 */
import { Box, Text } from "ink";
import { useTheme } from "../context.tsx";
import { Markdown } from "./Markdown.tsx";
import { ToolLine } from "./ToolLine.tsx";
import { Diff } from "./Diff.tsx";
import type { Message, Part } from "../../session/types.ts";

interface EditArgs {
  oldString: string;
  newString: string;
  filePath?: string;
}

/** Narrow an unknown tool-args bag to the edit shape (oldString/newString). */
function editArgs(args: unknown): EditArgs | null {
  if (!args || typeof args !== "object") return null;
  const bag = args as { oldString?: unknown; newString?: unknown; filePath?: unknown };
  if (typeof bag.oldString !== "string" || typeof bag.newString !== "string") return null;
  return {
    oldString: bag.oldString,
    newString: bag.newString,
    filePath: typeof bag.filePath === "string" ? bag.filePath : undefined,
  };
}

function userText(message: Message): string {
  return message.parts
    .filter((p): p is Extract<Part, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function PartView({ part }: { part: Part }) {
  const { theme } = useTheme();
  switch (part.type) {
    case "text":
      return <Markdown text={part.text} />;
    case "reasoning":
      return (
        <Text color={theme.fgSubtle} dimColor>
          {part.text}
        </Text>
      );
    case "tool": {
      if (part.tool === "edit") {
        const args = editArgs(part.args);
        if (args) {
          return <Diff oldText={args.oldString} newText={args.newString} path={args.filePath ?? part.title ?? "edit"} />;
        }
      }
      return <ToolLine part={part} />;
    }
    default:
      return null;
  }
}

export function MessageView({ message }: { message: Message }) {
  const { theme, icons } = useTheme();

  if (message.role === "user") {
    return (
      <Text color={theme.roleUser}>
        {icons.prompt} {userText(message)}
      </Text>
    );
  }

  return (
    <Box flexDirection="column">
      {message.parts.map((part) => (
        <PartView key={part.id} part={part} />
      ))}
    </Box>
  );
}
