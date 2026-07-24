/**
 * QuestionEngine — the state machine behind the agent's `question` tool.
 * Mirrors PermissionEngine's pattern: publish on the bus, block on a Deferred
 * until the UI answers, unwind cleanly on abort.
 */
import { Deferred } from "../util/deferred.ts";
import { createId } from "../util/id.ts";
import { QuestionCancelledError } from "../util/error.ts";
import type { Bus } from "../bus/index.ts";
import type { QuestionInput, QuestionReply, QuestionRequest } from "./types.ts";

interface Pending {
  request: QuestionRequest;
  deferred: Deferred<string[]>;
}

export class QuestionEngine {
  private pending = new Map<string, Pending>();

  constructor(private bus: Bus) {}

  /**
   * Ask the user. Resolves with the selected values (always an array).
   * Throws QuestionCancelledError on cancel or abort.
   */
  async ask(sessionID: string, input: QuestionInput, signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) throw new QuestionCancelledError("interrupted");
    const request: QuestionRequest = {
      id: createId("q"),
      sessionID,
      title: input.title,
      choices: input.choices,
      allowCustom: input.allowCustom ?? false,
      allowMultiple: input.allowMultiple ?? false,
    };
    const deferred = new Deferred<string[]>();
    this.pending.set(request.id, { request, deferred });

    if (signal) {
      const onAbort = () => {
        if (this.pending.delete(request.id)) {
          this.bus.publish({ type: "question.replied", requestID: request.id, reply: { kind: "cancel", feedback: "interrupted" } });
          deferred.reject(new QuestionCancelledError("interrupted"));
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });
      void deferred.promise.finally(() => signal.removeEventListener("abort", onAbort)).catch(() => {});
    }

    this.bus.publish({ type: "question.asked", request });
    return deferred.promise;
  }

  reply(requestID: string, reply: QuestionReply): void {
    const entry = this.pending.get(requestID);
    if (!entry) return;
    this.pending.delete(requestID);
    this.bus.publish({ type: "question.replied", requestID, reply });
    if (reply.kind === "answer") entry.deferred.resolve(reply.values);
    else entry.deferred.reject(new QuestionCancelledError(reply.feedback));
  }

  pendingRequests(): QuestionRequest[] {
    return [...this.pending.values()].map((e) => e.request);
  }
}
