/**
 * Right-hand sidebar panels. Live data:
 *  - Context      : token usage of the active session
 *  - Modified     : files touched this session (hidden when empty)
 *  - Todo         : the model's own todo list from the todo tool
 *  - LSP          : configured language servers + total diagnostic count
 *  - MCP          : connected MCP servers + tool counts
 */
import { Box, Text } from "ink";
import { useTheme, useUi } from "../context.tsx";
import type { ReactNode } from "react";

function Panel({ title, children }: { title: string; children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={theme.accent} bold>
        {title}
      </Text>
      {children}
    </Box>
  );
}

function Muted({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <Text color={theme.fgSubtle} dimColor>
      {text}
    </Text>
  );
}

const STATE_MARK: Record<string, string> = { ready: "●", connecting: "…", starting: "…", error: "✗" };

export function Sidebar() {
  const { theme, icons } = useTheme();
  const { context, changedFiles, todos, lspServers, lspDiagnostics, mcpServers } = useUi();

  const diagTotal = Object.values(lspDiagnostics).reduce((a, b) => a + b, 0);
  const remainingTodos = todos.filter((t) => t.status !== "completed").length;

  return (
    <Box flexDirection="column">
      <Panel title="Context">
        <Text color={theme.fgMuted}>
          {context.tokens} / {context.usable} ({context.pct}%)
        </Text>
      </Panel>

      {changedFiles.length > 0 ? (
        <Panel title="Modified Files">
          {changedFiles.map((file) => (
            <Text key={file} color={theme.fgMuted}>
              {icons.bullet} {file}
            </Text>
          ))}
        </Panel>
      ) : null}

      <Panel title={`Todo${todos.length > 0 ? `  ${todos.length - remainingTodos}/${todos.length}` : ""}`}>
        {todos.length === 0 ? (
          <Muted text="— none yet" />
        ) : (
          todos.slice(0, 8).map((t, i) => {
            const mark = t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
            const color = t.status === "completed" ? theme.fgSubtle : t.status === "in_progress" ? theme.accentAlt : theme.fgMuted;
            return (
              <Text key={`${i}-${t.content}`} color={color} wrap="truncate-end">
                {mark} {t.content}
              </Text>
            );
          })
        )}
      </Panel>

      <Panel title={`LSP${diagTotal > 0 ? `  ${diagTotal} diag` : ""}`}>
        {lspServers.length === 0 ? (
          <Muted text="— not configured" />
        ) : (
          lspServers.map((s) => (
            <Text
              key={s.language}
              color={s.state === "ready" ? theme.success : s.state === "error" ? theme.error : theme.fgMuted}
              wrap="truncate-end"
            >
              {STATE_MARK[s.state] ?? "·"} {s.language}
              {s.state === "ready" && s.diagnostics > 0 ? `  ${s.diagnostics}` : ""}
            </Text>
          ))
        )}
      </Panel>

      <Panel title="MCP">
        {mcpServers.length === 0 ? (
          <Muted text="— not configured" />
        ) : (
          mcpServers.map((s) => (
            <Text
              key={s.name}
              color={s.state === "ready" ? theme.success : s.state === "error" ? theme.error : theme.fgMuted}
              wrap="truncate-end"
            >
              {STATE_MARK[s.state] ?? "·"} {s.name}
              {s.state === "ready" ? `  ${s.toolCount}` : ""}
            </Text>
          ))
        )}
      </Panel>
    </Box>
  );
}
