/**
 * WhichKey cheatsheet (§12): a compact multi-column grid of `key → action` from
 * the {@link BINDINGS} table. Read-only — esc dismisses. Opened via the palette
 * `whichkey` item; the App wires `onCancel` to `closeModal`.
 */
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { BINDINGS } from "../keymap.ts";

const COLUMNS = 2;
const KEY_WIDTH = 20;

export function WhichKey({ onCancel }: { onCancel(): void }) {
  const { theme, icons, borders } = useTheme();

  useInput((_input, key) => {
    if (key.escape) onCancel();
  });

  const perColumn = Math.ceil(BINDINGS.length / COLUMNS);
  const columns = Array.from({ length: COLUMNS }, (_, c) => BINDINGS.slice(c * perColumn, (c + 1) * perColumn));

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.accent} bold>
        Keybindings
      </Text>
      <Box flexDirection="row">
        {columns.map((column, ci) => (
          <Box key={`col-${ci}`} flexDirection="column" marginRight={2}>
            {column.map((binding) => (
              <Text key={`${binding.key}-${binding.action}`}>
                <Text color={theme.accentAlt}>{binding.key.padEnd(KEY_WIDTH)}</Text>
                <Text color={theme.fgMuted}>
                  {icons.arrow} {binding.action}
                </Text>
              </Text>
            ))}
          </Box>
        ))}
      </Box>
      <Text color={theme.fgSubtle}>esc close</Text>
    </Box>
  );
}
