/**
 * Bottom-anchored scroll viewport for the transcript.
 *
 * Ink `<Static>` is deliberately NOT used: in alternate-screen mode the terminal
 * has no scrollback, so Static content that overflows the top is lost. Instead we
 * own the viewport — {@link windowMessages} selects the tail-anchored slice that
 * fits `height` rows (shifted up by `scrollOffset`), and a flex-end Box pins it to
 * the bottom. Windowing is message-granular: a single message taller than the
 * viewport renders from its top (row-accurate within-message scroll is a later
 * refinement).
 */
import { Box, Text } from "ink";
import { useUi } from "../context.tsx";
import { MessageView } from "./Message.tsx";
import type { Message } from "../../session/types.ts";

/** Estimated rendered row count for a message (line-granular, min 1). */
function messageRows(message: Message): number {
  let rows = 0;
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      rows += Math.max(1, part.text.split("\n").length);
    } else {
      rows += 1;
    }
  }
  return Math.max(1, rows);
}

/**
 * Select the tail-anchored slice of `all` that fits `height` rows. `scrollOffset`
 * (clamped to a valid message offset) moves the tail anchor toward older messages.
 * The anchor message is always included even when taller than the viewport.
 */
export function windowMessages(all: Message[], height: number, scrollOffset: number): Message[] {
  if (all.length === 0 || height <= 0) return [];
  const offset = Math.min(Math.max(0, scrollOffset), all.length - 1);
  const endExclusive = all.length - offset;
  const result: Message[] = [];
  let used = 0;
  for (let i = endExclusive - 1; i >= 0; i--) {
    const message = all[i];
    if (!message) continue;
    const rows = messageRows(message);
    if (result.length > 0 && used + rows > height) break;
    result.unshift(message);
    used += rows;
    if (used >= height) break;
  }
  return result;
}

/** Count of messages hidden above the visible window (drives the "↑ N earlier" hint). */
function hiddenAboveCount(all: Message[], scrollOffset: number, visibleCount: number): number {
  if (all.length === 0) return 0;
  const offset = Math.min(Math.max(0, scrollOffset), all.length - 1);
  const endExclusive = all.length - offset;
  return Math.max(0, endExclusive - visibleCount);
}

export function Transcript({ height }: { height: number }) {
  const state = useUi();
  const all = state.live ? [...state.history, state.live] : state.history;

  // Reserve a row for the hint when older content is hidden, so nothing overflows.
  const probe = windowMessages(all, height, state.scrollOffset);
  const hasHidden = hiddenAboveCount(all, state.scrollOffset, probe.length) > 0;
  const budget = hasHidden ? Math.max(1, height - 1) : height;
  const visible = hasHidden ? windowMessages(all, budget, state.scrollOffset) : probe;
  const above = hiddenAboveCount(all, state.scrollOffset, visible.length);

  return (
    <Box flexDirection="column" height={height} justifyContent="flex-end" overflow="hidden">
      {above > 0 ? <Text dimColor>{`${above} more above · PgUp/PgDn · shift+Up/Down to scroll`}</Text> : null}
      {visible.map((message) => (
        <MessageView key={message.id} message={message} />
      ))}
    </Box>
  );
}
