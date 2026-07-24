/**
 * DialogExportOptions — the modal behind /export.
 *
 * Five focusable fields, cycled with tab / shift+tab:
 *   0. filename text input (backed by TextBuffer)
 *   1. include reasoning (checkbox)
 *   2. include tool details (checkbox)
 *   3. include assistant metadata (checkbox)
 *   4. open in $EDITOR without saving (checkbox)
 *
 * Space toggles the focused checkbox; typing edits the filename when it has
 * focus. Enter fires onSubmit with the assembled ExportOptions. Esc cancels.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { TextBuffer } from "../input/buffer.ts";
import type { ExportOptions } from "../export.ts";

type Field = "filename" | "reasoning" | "tools" | "metadata" | "editor";
const ORDER: Field[] = ["filename", "reasoning", "tools", "metadata", "editor"];

export function DialogExportOptions({
  defaults,
  onSubmit,
  onCancel,
}: {
  defaults: ExportOptions;
  onSubmit(options: ExportOptions): void;
  onCancel(): void;
}) {
  const { theme, borders } = useTheme();
  const [buffer] = useState(() => new TextBuffer(defaults.filename));
  const [reasoning, setReasoning] = useState(defaults.includeReasoning);
  const [tools, setTools] = useState(defaults.includeToolDetails);
  const [metadata, setMetadata] = useState(defaults.includeMetadata);
  const [openInEditor, setOpenInEditor] = useState(defaults.openInEditor);
  const [focus, setFocus] = useState(0);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  const collect = (): ExportOptions => ({
    filename: buffer.value(),
    includeReasoning: reasoning,
    includeToolDetails: tools,
    includeMetadata: metadata,
    openInEditor,
  });

  const toggleFocused = () => {
    const field = ORDER[focus];
    if (field === "reasoning") setReasoning((v) => !v);
    else if (field === "tools") setTools((v) => !v);
    else if (field === "metadata") setMetadata((v) => !v);
    else if (field === "editor") setOpenInEditor((v) => !v);
  };

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }
    if (key.return) {
      onSubmit(collect());
      return;
    }
    if (key.tab) {
      setFocus((f) => (key.shift ? (f - 1 + ORDER.length) % ORDER.length : (f + 1) % ORDER.length));
      return;
    }
    const field = ORDER[focus];
    if (field === "filename") {
      if (key.leftArrow) { buffer.moveLeft(); bump(); return; }
      if (key.rightArrow) { buffer.moveRight(); bump(); return; }
      if (key.backspace || key.delete) { buffer.backspace(); bump(); return; }
      if (input && !key.ctrl && !key.meta) {
        buffer.insert(input.replace(/\n/g, ""));
        bump();
      }
      return;
    }
    if (input === " " || key.return) toggleFocused();
  });

  const row = (idx: number, label: string, checked: boolean): React.ReactElement => {
    const active = idx === focus;
    const glyph = checked ? "[x]" : "[ ]";
    return (
      <Text color={active ? theme.selectionFg : theme.fg} backgroundColor={active ? theme.selectionBg : undefined}>
        {active ? "▸ " : "  "}
        {glyph} {label}
      </Text>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle={borders === "unicode" ? "round" : "single"}
      borderColor={theme.accent}
      backgroundColor={theme.bgPanel}
      paddingX={1}
      minWidth={56}
    >
      <Text color={theme.accent} bold>
        Export session
      </Text>

      <Box flexDirection="column" marginTop={1}>
        <Text color={focus === 0 ? theme.selectionFg : theme.fgSubtle} backgroundColor={focus === 0 ? theme.selectionBg : undefined}>
          {focus === 0 ? "▸ " : "  "}filename
        </Text>
        <Text color={theme.fg}>  {buffer.value() || " "}</Text>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        {row(1, "include thinking / reasoning blocks", reasoning)}
        {row(2, "include tool details (args + output)", tools)}
        {row(3, "include assistant metadata (model, tokens)", metadata)}
        {row(4, "open in $EDITOR without saving", openInEditor)}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.fgMuted}>tab focus · space toggle · enter export · esc cancel</Text>
      </Box>
    </Box>
  );
}
