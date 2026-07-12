/**
 * Confirm dialog (§12): a yes/no gate. `y` runs `onYes`, `n` (or esc) runs
 * `onNo`. The App supplies both callbacks (e.g. destructive-action guards).
 */
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";

export function Confirm({ message, onYes, onNo }: { message: string; onYes(): void; onNo(): void }) {
  const { theme, icons, borders } = useTheme();

  useInput((input, key) => {
    if (input === "y" || input === "Y") onYes();
    else if (input === "n" || input === "N" || key.escape) onNo();
  });

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.fg}>{message}</Text>
      <Text color={theme.fgMuted}>
        <Text color={theme.success}>[y]es</Text> {icons.bullet} <Text color={theme.error}>[n]o</Text>
      </Text>
    </Box>
  );
}
