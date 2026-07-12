/**
 * Empty-session splash: the centered logo wordmark, an example prompt, the
 * active `<agent> · <model>` line, and a keybinding hint row. Shown by the App
 * when the transcript is empty (no history, no live message).
 */
import { Box, Text } from "ink";
import { useTheme, useUi } from "../context.tsx";

/** The display model: the part after the last `/`, or `default` when unset. */
function modelShort(model: string | undefined): string {
  if (!model) return "default";
  const parts = model.split("/");
  return parts[parts.length - 1] ?? model;
}

export function Home() {
  const { theme, logo } = useTheme();
  const { session, modelDisplay } = useUi();

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Text color={theme.accent}>{logo}</Text>
      <Box marginTop={1}>
        <Text color={theme.fgMuted}>Ask anything, or type / for commands.</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.agent}>{session.agent}</Text>
        <Text color={theme.fgSubtle}> · </Text>
        <Text color={theme.fgMuted}>{modelShort(modelDisplay)}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.fgSubtle}>tab agents · ctrl+p commands · ? help</Text>
      </Box>
    </Box>
  );
}
