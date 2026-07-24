/**
 * Question dialog — surfaces a QuestionRequest published by the agent's
 * `question` tool. Single-select or multi-select depending on the request;
 * `allowCustom` adds a "type your own" input at the bottom.
 *
 * Enter → submit; Esc / ctrl+c → cancel (the tool call throws
 * QuestionCancelledError and the turn unwinds).
 */
import { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme, useUi } from "../context.tsx";
import { TextBuffer } from "../input/buffer.ts";
import type { CommandContext } from "../types.ts";

export function Question({ ctx }: { ctx: CommandContext }) {
  const { theme, borders } = useTheme();
  const state = useUi();
  const q = state.question;
  const rows = useMemo(() => q?.choices ?? [], [q?.id]);
  const [selected, setSelected] = useState(0);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [customMode, setCustomMode] = useState(false);
  const [buffer] = useState(() => new TextBuffer(""));
  const [, bump] = useState(0);
  const forceRefresh = () => bump((v) => v + 1);

  if (!q) return null;

  const submit = () => {
    const values: string[] = [];
    if (q.allowMultiple) {
      for (const i of picked) if (rows[i] !== undefined) values.push(rows[i]!);
    } else {
      if (rows[selected] !== undefined) values.push(rows[selected]!);
    }
    if (customMode) {
      const custom = buffer.value().trim();
      if (custom) values.push(custom);
    }
    ctx.store.replyQuestion(q.id, { kind: "answer", values });
  };

  const cancel = () => {
    ctx.store.replyQuestion(q.id, { kind: "cancel" });
  };

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === "c")) {
      cancel();
      return;
    }
    if (customMode) {
      if (key.return) { submit(); return; }
      if (key.tab) { setCustomMode(false); return; }
      if (key.backspace || key.delete) { buffer.backspace(); forceRefresh(); return; }
      if (key.leftArrow) { buffer.moveLeft(); forceRefresh(); return; }
      if (key.rightArrow) { buffer.moveRight(); forceRefresh(); return; }
      if (input && !key.ctrl && !key.meta) { buffer.insert(input.replace(/\n/g, "")); forceRefresh(); }
      return;
    }
    if (key.return) { submit(); return; }
    if (key.tab && q.allowCustom) { setCustomMode(true); return; }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, rows.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    if (input === " " && q.allowMultiple) {
      setPicked((prev) => {
        const next = new Set(prev);
        if (next.has(selected)) next.delete(selected);
        else next.add(selected);
        return next;
      });
    }
  });

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
        {q.title}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color={theme.fgMuted}>(no preset choices — use tab to type an answer)</Text>
        ) : (
          rows.map((choice, i) => {
            const active = i === selected;
            const glyph = q.allowMultiple ? (picked.has(i) ? "[x]" : "[ ]") : active ? "▸" : " ";
            return (
              <Text key={i} color={active ? theme.selectionFg : theme.fg} backgroundColor={active ? theme.selectionBg : undefined}>
                {" "}{glyph} {choice}
              </Text>
            );
          })
        )}
      </Box>
      {q.allowCustom ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={customMode ? theme.accent : theme.fgMuted}>
            {customMode ? "▸ " : "  "}Custom: {buffer.value() || (customMode ? "…" : "(tab to type)")}
          </Text>
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text color={theme.fgMuted}>
          {q.allowMultiple ? "space toggle · " : ""}enter submit · {q.allowCustom ? "tab custom · " : ""}esc cancel
        </Text>
      </Box>
    </Box>
  );
}
