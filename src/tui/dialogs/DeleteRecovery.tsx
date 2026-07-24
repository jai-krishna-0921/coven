/**
 * DeleteRecovery — surfaces the four options offered by performDelete when a
 * session's disk cleanup fails. Hotkey shortcuts (r/t/f/c) supplement arrow
 * navigation so a keyboard user never has to touch the mouse.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import type { DeleteChoice } from "../../session/deleteFlow.ts";

interface Option {
  key: DeleteChoice;
  hotkey: string;
  label: string;
}

const OPTIONS: readonly Option[] = [
  { key: "retry", hotkey: "r", label: "Retry the delete" },
  { key: "trash", hotkey: "t", label: "Move to trash directory" },
  { key: "metadata", hotkey: "f", label: "Force-remove metadata only (leaves messages.jsonl)" },
  { key: "cancel", hotkey: "c", label: "Cancel — leave the session on disk" },
];

export function DeleteRecovery({
  sessionTitle,
  error,
  onChoice,
}: {
  sessionID: string;
  sessionTitle: string;
  error: string;
  onChoice(choice: DeleteChoice): void;
}) {
  const { theme, borders } = useTheme();
  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onChoice("cancel");
      return;
    }
    if (key.return) {
      onChoice(OPTIONS[selected]!.key);
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, OPTIONS.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    // Hotkey shortcuts.
    const hit = OPTIONS.find((o) => o.hotkey === input.toLowerCase() && !key.ctrl && !key.meta);
    if (hit) onChoice(hit.key);
  });

  return (
    <Box
      flexDirection="column"
      borderStyle={borders === "unicode" ? "round" : "single"}
      borderColor={theme.error}
      backgroundColor={theme.bgPanel}
      paddingX={1}
      minWidth={60}
    >
      <Text color={theme.error} bold>
        Delete failed
      </Text>
      <Text color={theme.fg}>Session: {sessionTitle}</Text>
      <Text color={theme.fgMuted}>{error}</Text>
      <Box flexDirection="column" marginTop={1}>
        {OPTIONS.map((opt, i) => {
          const active = i === selected;
          return (
            <Text key={opt.key} color={active ? theme.selectionFg : theme.fg} backgroundColor={active ? theme.selectionBg : undefined}>
              {active ? "▸ " : "  "}({opt.hotkey}) {opt.label}
            </Text>
          );
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.fgMuted}>↑↓ move · enter select · r/t/f/c hotkey · esc cancel</Text>
      </Box>
    </Box>
  );
}
