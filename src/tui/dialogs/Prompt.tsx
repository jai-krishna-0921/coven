/**
 * Prompt dialog (§12): a single-line free-text input backed by {@link TextBuffer}.
 * Enter submits the current value, esc cancels. `mask` replaces the echoed
 * characters with bullets (for API-key entry) while still submitting the real
 * text. `initial` prefills the buffer (e.g. the current title for a rename).
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { TextBuffer } from "../input/buffer.ts";

export function Prompt({
  message,
  initial,
  mask,
  onSubmit,
  onCancel,
}: {
  message: string;
  initial?: string;
  mask?: boolean;
  onSubmit(text: string): void;
  onCancel(): void;
}) {
  const { theme, icons, borders } = useTheme();
  const [buffer] = useState(() => new TextBuffer(initial ?? ""));
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useInput((input, key) => {
    if (key.return) {
      onSubmit(buffer.value());
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.leftArrow) {
      buffer.moveLeft();
      bump();
      return;
    }
    if (key.rightArrow) {
      buffer.moveRight();
      bump();
      return;
    }
    if (key.backspace || key.delete) {
      buffer.backspace();
      bump();
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      buffer.insert(input.replace(/\n/g, "")); // single-line: never split rows
      bump();
    }
  });

  const value = buffer.value();
  const display = mask ? "•".repeat(value.length) : value;

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} paddingX={1}>
      <Text color={theme.accent}>{message}</Text>
      <Text>
        <Text color={theme.fgSubtle}>{icons.prompt} </Text>
        <Text color={theme.fg}>{display}</Text>
      </Text>
      <Text color={theme.fgSubtle}>enter submit · esc cancel</Text>
    </Box>
  );
}
