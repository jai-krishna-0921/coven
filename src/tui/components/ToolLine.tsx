/**
 * One-row renderer for a tool part: a spinner while running, an ok/err glyph
 * once settled, followed by the tool name and its title. `edit` tool parts that
 * carry args render nothing — MessageView draws those as a <Diff/> instead.
 */
import { Text } from "ink";
import { useTheme } from "../context.tsx";
import { Spinner } from "./Spinner.tsx";
import type { Part } from "../../session/types.ts";

type ToolPart = Extract<Part, { type: "tool" }>;

function hasArgs(args: unknown): boolean {
  return typeof args === "object" && args !== null && Object.keys(args).length > 0;
}

export function ToolLine({ part }: { part: ToolPart }) {
  const { theme, icons } = useTheme();

  // Edit diffs are drawn by MessageView via <Diff/>, not as a tool line.
  if (part.tool === "edit" && hasArgs(part.args)) return null;

  const running = part.status === "running" || part.status === "pending";
  const errored = part.status === "error";

  return (
    <Text>
      {running ? (
        <Spinner />
      ) : (
        <Text color={errored ? theme.toolErr : theme.toolOk}>{errored ? icons.err : icons.ok}</Text>
      )}
      {" "}
      <Text color={theme.tool}>{part.tool}</Text>
      {part.title ? <Text color={theme.fgMuted}> {part.title}</Text> : null}
    </Text>
  );
}
