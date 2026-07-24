/**
 * Timeline dialog — /timeline. Lists the current session's user messages
 * newest-first with a short preview + relative age. Enter jumps the transcript
 * to the highlighted message; 'f' forks the session at that message and
 * switches to the fork; Esc closes.
 *
 * Custom (not {@link SelectDialog}) because we need a per-row extra-key hook
 * ('f') that the base picker doesn't provide.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { relTime } from "../../util/relTime.ts";
import type { CommandContext } from "../types.ts";

const PREVIEW_MAX = 60;

function preview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_MAX) return collapsed;
  return collapsed.slice(0, PREVIEW_MAX - 1) + "…";
}

export function Timeline({ ctx }: { ctx: CommandContext }) {
  const { theme, borders } = useTheme();
  const rows = ctx.app.store
    .messagesOf(ctx.session.id)
    .filter((m) => m.role === "user" && !m.compaction)
    .map((m) => {
      const text = m.parts
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join(" ");
      return { id: m.id, preview: preview(text), age: relTime(Date.now() - m.time) };
    })
    .reverse();

  const [selected, setSelected] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      ctx.closeModal();
      return;
    }
    if (rows.length === 0) return;
    const row = rows[Math.min(selected, rows.length - 1)];
    if (key.return) {
      if (row) ctx.store.scrollToMessage(row.id);
      ctx.closeModal();
      return;
    }
    if (input === "f" && !key.ctrl && !key.meta) {
      if (row) {
        try {
          const forked = ctx.app.store.fork(ctx.session.id, row.id);
          ctx.app.bus.publish({ type: "session.created", session: forked });
          ctx.store.setSessionID(forked.id);
        } catch (error) {
          ctx.toast(String(error), "error");
        }
      }
      ctx.closeModal();
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, rows.length - 1));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle={borders === "unicode" ? "round" : "single"}
      borderColor={theme.accent}
      paddingX={1}
      minWidth={60}
    >
      <Text color={theme.accent} bold>
        Timeline — user messages
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {rows.length === 0 ? (
          <Text color={theme.fgMuted}>no user messages yet</Text>
        ) : (
          rows.map((r, i) => {
            const active = i === selected;
            return (
              <Box key={r.id}>
                <Text color={active ? theme.selectionFg : theme.fg} backgroundColor={active ? theme.selectionBg : undefined}>
                  {active ? "▸ " : "  "}
                  {r.preview.padEnd(PREVIEW_MAX + 2)}
                </Text>
                <Text color={theme.fgMuted}> {r.age.padStart(4)}</Text>
              </Box>
            );
          })
        )}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.fgMuted}>↑↓ move · enter jump · f fork · esc close</Text>
      </Box>
    </Box>
  );
}
