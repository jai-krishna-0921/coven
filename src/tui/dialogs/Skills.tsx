/**
 * Skills dialog (§12): a two-pane browser over `app.skills.all()`. The left pane
 * is the filterable skill list (reusing {@link filterOptions} — the same
 * prefix-before-fuzzy narrowing the {@link SelectDialog} base uses); the right
 * pane previews the highlighted skill's description and the head of its content.
 * Read-only: enter/esc close. `app.skills` is guarded (`?.`) for robustness.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { filterOptions, type SelectOption } from "./Select.tsx";
import type { CommandContext } from "../types.ts";

const VISIBLE = 10;
const PREVIEW_LINES = 8;

/** Window start that keeps `sel` in view, centered when possible. */
function windowStart(sel: number, total: number): number {
  if (total <= VISIBLE) return 0;
  const half = Math.floor(VISIBLE / 2);
  return Math.min(Math.max(0, sel - half), total - VISIBLE);
}

export function Skills({ ctx }: { ctx: CommandContext }) {
  const { theme, icons, borders } = useTheme();
  const all = ctx.app.skills?.all() ?? [];
  const options: SelectOption[] = all.map((skill) => ({ value: skill.name, label: skill.name, hint: skill.description }));

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const filtered = filterOptions(options, query);
  const sel = Math.min(Math.max(0, selected), Math.max(0, filtered.length - 1));
  const current = filtered[sel];
  const skill = current ? all.find((s) => s.name === current.value) : undefined;

  useInput((input, key) => {
    if (key.escape || key.return) {
      ctx.closeModal();
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      setSelected((s) => Math.min(s + 1, Math.max(0, filtered.length - 1)));
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setSelected(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((q) => q + input);
      setSelected(0);
    }
  });

  const start = windowStart(sel, filtered.length);
  const shown = filtered.slice(start, start + VISIBLE);
  const preview = (skill?.content ?? "")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .slice(0, PREVIEW_LINES);

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={theme.borderFocus} backgroundColor={theme.bgPanel} paddingX={1}>
      <Text color={theme.accent} bold>
        Skills
      </Text>
      <Box>
        <Text color={theme.fgSubtle}>filter </Text>
        <Text color={theme.fg}>{query}</Text>
      </Box>
      <Box flexDirection="row">
        <Box flexDirection="column" marginRight={2}>
          {shown.length > 0 ? (
            shown.map((option, i) => {
              const isSelected = start + i === sel;
              return (
                <Text
                  key={option.value}
                  backgroundColor={isSelected ? theme.selectionBg : undefined}
                  color={isSelected ? theme.selectionFg : theme.fg}
                >
                  {isSelected ? icons.arrow : " "} {option.label}
                </Text>
              );
            })
          ) : (
            <Text color={theme.fgSubtle}>no skills</Text>
          )}
        </Box>
        <Box flexDirection="column">
          {skill ? (
            <>
              <Text color={theme.accentAlt} bold>
                {skill.name}
              </Text>
              <Text color={theme.fgMuted}>{skill.description}</Text>
              {preview.map((line, i) => (
                <Text key={`line-${i}`} color={theme.fgSubtle}>
                  {line}
                </Text>
              ))}
            </>
          ) : (
            <Text color={theme.fgSubtle}>—</Text>
          )}
        </Box>
      </Box>
      <Text color={theme.fgSubtle}>↑↓ browse · type to filter · esc close</Text>
    </Box>
  );
}
