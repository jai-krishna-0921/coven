/**
 * Typed event bus. Everything observable in Coven flows through here:
 * session lifecycle, streaming parts, tool execution, permission asks.
 * The TUI and plugins are both just subscribers.
 */
import type { Message, Part, SessionInfo } from "../session/types.ts";
import type { PermissionRequest } from "../permission/types.ts";
import type { McpServerStatus } from "../mcp/types.ts";
import { createLogger } from "../util/log.ts";

export type BusEvent =
  | { type: "session.created"; session: SessionInfo }
  | { type: "session.updated"; session: SessionInfo }
  | { type: "session.status"; sessionID: string; status: "idle" | "busy" | "error" }
  | { type: "message.created"; message: Message }
  | { type: "message.updated"; message: Message }
  | { type: "part.delta"; sessionID: string; messageID: string; partID: string; delta: string }
  | { type: "part.updated"; sessionID: string; messageID: string; part: Part }
  | { type: "tool.started"; sessionID: string; callID: string; tool: string }
  | { type: "tool.finished"; sessionID: string; callID: string; tool: string; status: "completed" | "error" }
  | { type: "permission.asked"; request: PermissionRequest }
  | { type: "permission.replied"; requestID: string; reply: "once" | "always" | "reject" }
  | { type: "session.compacting"; sessionID: string }
  | { type: "session.compacted"; sessionID: string; tokensBefore: number }
  | { type: "mcp.status"; status: McpServerStatus };

export type BusEventType = BusEvent["type"];

type Listener = (event: BusEvent) => void | Promise<void>;

const log = createLogger("bus");

export class Bus {
  private listeners = new Set<Listener>();

  publish(event: BusEvent): void {
    for (const listener of this.listeners) {
      try {
        const result = listener(event);
        if (result instanceof Promise) {
          result.catch((error) => log.error("async listener failed", { type: event.type, error: String(error) }));
        }
      } catch (error) {
        log.error("listener failed", { type: event.type, error: String(error) });
      }
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
