/**
 * UI-agnostic recovery orchestrator for session deletion. Both the TUI
 * (DeleteRecovery modal) and the CLI (numbered stdin prompt) drive this same
 * function so the semantics never drift between surfaces.
 *
 * Flow: try store.deleteChecked → on success return; on failure loop:
 *   ask(err) → 'retry' | 'trash' | 'metadata' | 'cancel'
 *   dispatch to store.retryRm | store.moveToTrash | store.unlinkMetadataOnly
 *   on branch failure, re-ask with the fresh error; on branch success return
 *   the matching outcome; 'cancel' returns { outcome: 'cancelled' } immediately.
 */
import type { SessionStore } from "./store.ts";

export type DeleteChoice = "retry" | "trash" | "metadata" | "cancel";

export interface DeleteFlowResult {
  outcome: "deleted" | "trashed" | "metadata-only" | "cancelled";
  path?: string; // set when outcome === "trashed"
  lastError?: string; // set when outcome === "cancelled" after at least one failure
}

export type DeleteChoiceAsker = (context: { sessionID: string; error: string; attempt: number }) => Promise<DeleteChoice>;

export async function performDelete(
  store: SessionStore,
  sessionID: string,
  ask: DeleteChoiceAsker,
): Promise<DeleteFlowResult> {
  const first = store.deleteChecked(sessionID);
  if (first.ok) return { outcome: "deleted" };

  let error = first.error;
  for (let attempt = 1; attempt <= 10; attempt++) {
    const choice = await ask({ sessionID, error, attempt });
    if (choice === "cancel") return { outcome: "cancelled", lastError: error };
    if (choice === "retry") {
      const r = store.retryRm(sessionID);
      if (r.ok) return { outcome: "deleted" };
      error = r.error;
      continue;
    }
    if (choice === "trash") {
      const t = store.moveToTrash(sessionID);
      if (t.ok) return { outcome: "trashed", path: t.path };
      error = t.error;
      continue;
    }
    if (choice === "metadata") {
      const m = store.unlinkMetadataOnly(sessionID);
      if (m.ok) return { outcome: "metadata-only" };
      error = m.error;
      continue;
    }
  }
  // Runaway guard — the human said neither cancel nor success 10 times running.
  return { outcome: "cancelled", lastError: error };
}
