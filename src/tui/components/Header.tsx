/**
 * Top chrome row: the `◆ coven` wordmark followed by the active
 * `<model-short> · <agent> · <title>` breadcrumb, then a full-width rule.
 * The model is shortened to the segment after the last `/` (provider dropped);
 * an unset model shows `default` (the agent/config default resolves at runtime).
 */
import { Box, Text, useStdout } from "ink";
import { useTheme, useUi } from "../context.tsx";

/** The display model: the part after the last `/`, or `default` when unset. */
function modelShort(model: string | undefined): string {
  if (!model) return "default";
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

export function Header() {
  const { theme, icons } = useTheme();
  const { session, modelDisplay } = useUi();
  const { stdout } = useStdout();
  const width = stdout?.columns ?? 80;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent} bold>
          {icons.agent} coven
        </Text>
        <Text color={theme.fgMuted}>
          {"  "}
          {modelShort(modelDisplay)} · {session.agent} · {session.title}
        </Text>
      </Box>
      <Text color={theme.border}>{"─".repeat(Math.max(1, width))}</Text>
    </Box>
  );
}
