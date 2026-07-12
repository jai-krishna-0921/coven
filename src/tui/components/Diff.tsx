/**
 * Inline unified diff for edit/write tool parts. No diff library: a naive
 * line-by-line compare — equal-length inputs mark changed lines in place,
 * unequal-length inputs fall back to all-deletions then all-additions.
 * Output is capped at {@link MAX_ROWS} with a "… N more" footer.
 */
import { Box, Text } from "ink";
import { useTheme } from "../context.tsx";

export interface DiffRow {
  kind: "context" | "add" | "del";
  text: string;
}

const MAX_ROWS = 20;

export function diffRows(oldText: string, newText: string): DiffRow[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const rows: DiffRow[] = [];
  if (oldLines.length === newLines.length) {
    for (let i = 0; i < oldLines.length; i++) {
      const o = oldLines[i] ?? "";
      const n = newLines[i] ?? "";
      if (o === n) {
        rows.push({ kind: "context", text: o });
      } else {
        rows.push({ kind: "del", text: o });
        rows.push({ kind: "add", text: n });
      }
    }
  } else {
    for (const o of oldLines) rows.push({ kind: "del", text: o });
    for (const n of newLines) rows.push({ kind: "add", text: n });
  }
  return rows;
}

function prefixOf(kind: DiffRow["kind"]): string {
  return kind === "add" ? "+" : kind === "del" ? "-" : " ";
}

export function Diff({ oldText, newText, path }: { oldText: string; newText: string; path: string }) {
  const { theme } = useTheme();
  const rows = diffRows(oldText, newText);
  const shown = rows.slice(0, MAX_ROWS);
  const hidden = rows.length - shown.length;
  const colorFor = (kind: DiffRow["kind"]) =>
    kind === "add" ? theme.diffAdd : kind === "del" ? theme.diffDel : theme.fgMuted;

  return (
    <Box flexDirection="column">
      <Text bold color={theme.fgMuted}>
        {path}
      </Text>
      {shown.map((row, i) => (
        <Text key={i} color={colorFor(row.kind)} dimColor={row.kind === "context"}>
          {prefixOf(row.kind)}
          {row.text}
        </Text>
      ))}
      {hidden > 0 ? <Text color={theme.fgSubtle}>… {hidden} more</Text> : null}
    </Box>
  );
}
