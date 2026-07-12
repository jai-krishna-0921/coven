/**
 * Permission dialog (§12): the interactive gate for a pending
 * {@link PermissionRequest}. It reads `state.permission` from {@link useUi} and
 * replies through {@link useStore}'s `replyPermission`. `y` allows once, `a`
 * allows always (this session), `n` opens a free-text feedback line whose Enter
 * rejects with the note. A `metadata.dangerous` request shows a DANGEROUS
 * banner. Renders nothing when no permission is pending.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme, useStore, useUi } from "../context.tsx";

export function Permission() {
  const { theme, icons, borders } = useTheme();
  const store = useStore();
  const request = useUi().permission;

  const [feedback, setFeedback] = useState("");
  const [rejecting, setRejecting] = useState(false);

  useInput(
    (input, key) => {
      if (!request) return;
      if (rejecting) {
        if (key.return) {
          store.replyPermission("reject", feedback.length > 0 ? feedback : undefined);
          return;
        }
        if (key.escape) {
          setRejecting(false);
          setFeedback("");
          return;
        }
        if (key.backspace || key.delete) {
          setFeedback((f) => f.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta && !key.tab) setFeedback((f) => f + input);
        return;
      }
      if (input === "y") {
        store.replyPermission("once");
        return;
      }
      if (input === "a") {
        store.replyPermission("always");
        return;
      }
      if (input === "n" || key.escape) {
        setRejecting(true);
      }
    },
    { isActive: request !== null },
  );

  if (!request) return null;

  const dangerous = request.metadata?.["dangerous"] === true;

  return (
    <Box flexDirection="column" borderStyle={borders as "round" | "classic"} borderColor={dangerous ? theme.error : theme.borderFocus} backgroundColor={theme.bgPanel} paddingX={1}>
      {dangerous ? (
        <Text backgroundColor={theme.error} color={theme.selectionFg} bold>
          {icons.warn} DANGEROUS
        </Text>
      ) : null}
      <Text color={theme.accent} bold>
        Permission required
      </Text>
      <Text>
        <Text color={theme.fgSubtle}>kind </Text>
        <Text color={theme.warning}>{request.permission}</Text>
      </Text>
      <Text color={theme.fg}>{request.title}</Text>
      {request.patterns.length > 0 ? <Text color={theme.fgMuted}>{request.patterns.join(", ")}</Text> : null}
      {rejecting ? (
        <Box flexDirection="column">
          <Text color={theme.fgSubtle}>reason (enter to reject · esc to cancel)</Text>
          <Text>
            <Text color={theme.fgSubtle}>{icons.prompt} </Text>
            <Text color={theme.fg}>{feedback}</Text>
          </Text>
        </Box>
      ) : (
        <Text color={theme.fgMuted}>
          <Text color={theme.success}>[y]es</Text> {icons.bullet} <Text color={theme.warning}>[a]lways</Text> {icons.bullet}{" "}
          <Text color={theme.error}>[n]o</Text>
        </Text>
      )}
    </Box>
  );
}
