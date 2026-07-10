/**
 * The permission engine — Coven's core guardrail.
 *
 * Model: a Ruleset is an ordered list of { permission, pattern, action }.
 * Evaluation is LAST-match-wins: later rules override earlier ones, so config
 * merge order (defaults → agent → user → session-approved) is the precedence.
 * Unmatched requests fall back to "ask".
 */
import { wildcardMatch } from "../util/wildcard.ts";
import { Deferred } from "../util/deferred.ts";
import { createId } from "../util/id.ts";
import { PermissionDeniedError, PermissionRejectedError } from "../util/error.ts";
import type { Bus } from "../bus/index.ts";
import type { PermissionConfig } from "../config/schema.ts";
import type { AskInput, PermissionReply, PermissionRequest, PermissionRule, Ruleset } from "./types.ts";

export function evaluate(permission: string, pattern: string, ...rulesets: Ruleset[]): PermissionRule {
  const flat = rulesets.flat();
  for (let i = flat.length - 1; i >= 0; i--) {
    const rule = flat[i]!;
    if (wildcardMatch(permission, rule.permission) && wildcardMatch(pattern, rule.pattern)) {
      return rule;
    }
  }
  return { permission, pattern: "*", action: "ask" };
}

/** Convert the config shape ("bash": "ask" | { "git status": "allow" }) into ordered rules. */
export function rulesFromConfig(config: PermissionConfig | undefined): Ruleset {
  if (!config) return [];
  const rules: Ruleset = [];
  for (const [permission, value] of Object.entries(config)) {
    if (typeof value === "string") {
      rules.push({ permission, pattern: "*", action: value });
    } else {
      for (const [pattern, action] of Object.entries(value)) {
        rules.push({ permission, pattern, action });
      }
    }
  }
  return rules;
}

interface PendingAsk {
  request: PermissionRequest;
  deferred: Deferred<void>;
}

/**
 * Stateful ask flow. When evaluation says "ask", the request is published on the
 * bus and the calling tool execution blocks on a Deferred until the front-end
 * replies once / always / reject. "always" appends an allow rule for the session.
 */
export class PermissionEngine {
  private pending = new Map<string, PendingAsk>();
  private approved: Ruleset = [];

  constructor(
    private bus: Bus,
    private baseline: Ruleset,
  ) {}

  /** Resolve the effective action without side effects (used for tool filtering). */
  resolve(permission: string, pattern: string, ...extra: Ruleset[]): PermissionRule {
    return evaluate(permission, pattern, this.baseline, ...extra, this.approved);
  }

  /**
   * Gate an action. Throws PermissionDeniedError on deny, PermissionRejectedError
   * on user rejection; resolves silently when allowed.
   */
  async ask(sessionID: string, input: AskInput, agentRules: Ruleset = []): Promise<void> {
    const needsAsk: string[] = [];
    for (const pattern of input.patterns.length > 0 ? input.patterns : ["*"]) {
      const rule = this.resolve(input.permission, pattern, agentRules);
      if (rule.action === "deny") throw new PermissionDeniedError(input.permission, pattern);
      if (rule.action === "ask") needsAsk.push(pattern);
    }
    if (needsAsk.length === 0) return;

    const request: PermissionRequest = {
      id: createId("perm"),
      sessionID,
      permission: input.permission,
      patterns: needsAsk,
      title: input.title,
      metadata: input.metadata,
    };
    const deferred = new Deferred<void>();
    this.pending.set(request.id, { request, deferred });
    this.bus.publish({ type: "permission.asked", request });
    return deferred.promise;
  }

  reply(requestID: string, reply: PermissionReply, feedback?: string): void {
    const entry = this.pending.get(requestID);
    if (!entry) return;
    this.pending.delete(requestID);
    this.bus.publish({ type: "permission.replied", requestID, reply });

    if (reply === "reject") {
      entry.deferred.reject(new PermissionRejectedError(feedback));
      // Reject everything else queued for the same session: the model's plan is void.
      for (const [id, other] of this.pending) {
        if (other.request.sessionID === entry.request.sessionID) {
          this.pending.delete(id);
          other.deferred.reject(new PermissionRejectedError("Rejected alongside a related request"));
        }
      }
      return;
    }
    if (reply === "always") {
      for (const pattern of entry.request.patterns) {
        this.approved.push({ permission: entry.request.permission, pattern, action: "allow" });
      }
      // Settle any concurrent pendings the new allow-rules now cover — a
      // parallel wave of identical asks shouldn't prompt twice.
      for (const [id, other] of this.pending) {
        if (other.request.patterns.every((p) => this.resolve(other.request.permission, p).action === "allow")) {
          this.pending.delete(id);
          other.deferred.resolve();
        }
      }
    }
    entry.deferred.resolve();
  }

  pendingRequests(): PermissionRequest[] {
    return [...this.pending.values()].map((entry) => entry.request);
  }
}
