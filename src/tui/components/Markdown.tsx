/**
 * Minimal, total inline markdown renderer — no external md dependency.
 *
 * Line-based: each line is classified (heading / bullet / plain) then its inline
 * spans (`**bold**`, `` `code` ``) are parsed and emitted as themed <Text> runs.
 * Anything unmatched passes through verbatim; the parser never throws.
 */
import { Box, Text } from "ink";
import { useTheme } from "../context.tsx";

interface Span {
  text: string;
  bold?: boolean;
  code?: boolean;
}

const INLINE = /\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Split a single line into bold/code/plain spans. */
function parseInline(line: string): Span[] {
  const spans: Span[] = [];
  let last = 0;
  INLINE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE.exec(line)) !== null) {
    if (match.index > last) spans.push({ text: line.slice(last, match.index) });
    if (match[1] !== undefined) spans.push({ text: match[1], bold: true });
    else if (match[2] !== undefined) spans.push({ text: match[2], code: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  if (spans.length === 0) spans.push({ text: line });
  return spans;
}

export function Markdown({ text }: { text: string }) {
  const { theme, icons } = useTheme();

  const renderSpans = (spans: Span[]) =>
    spans.map((span, i) => (
      <Text key={i} bold={span.bold} color={span.code ? theme.accentAlt : undefined}>
        {span.text}
      </Text>
    ));

  const lines = text.split("\n");
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading) {
          return (
            <Text key={i} bold color={theme.accent}>
              {heading[2] ?? ""}
            </Text>
          );
        }
        const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
        if (bullet) {
          return (
            <Text key={i}>
              <Text color={theme.accent}>{icons.bullet} </Text>
              {renderSpans(parseInline(bullet[1] ?? ""))}
            </Text>
          );
        }
        return <Text key={i}>{renderSpans(parseInline(line))}</Text>;
      })}
    </Box>
  );
}
