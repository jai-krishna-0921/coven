/**
 * Context management: token estimation, DCP-style tool-output pruning, and
 * compaction selection. Algorithm follows OpenCode's battle-tested numbers:
 *
 * - estimate = chars/4 (provider-reported usage is the primary overflow signal)
 * - usable   = contextLimit − min(20k, maxOutput)
 * - prune    : mask old tool outputs, protecting the newest 40k tokens of
 *              output and the 2 most recent user turns; only act when ≥20k
 *              tokens are reclaimable (cache-friendly hysteresis)
 * - compact  : summarize the head with a rolling "anchored summary", keep the
 *              last `tailTurns` turns verbatim within a token budget
 *
 * The store stays immutable-append; pruning marks parts (`prunedAt`) and the
 * mask is applied at render time — fully reversible, nothing deleted.
 */
import type { Message } from "./types.ts";

export const PRUNE_MINIMUM = 20_000;
export const PRUNE_PROTECT = 40_000;
export const PRUNE_PROTECTED_TOOLS = new Set(["skill", "task", "todo", "write", "edit"]);
export const COMPACTION_BUFFER = 20_000;
export const TOOL_OUTPUT_MAX_CHARS_FOR_SUMMARY = 2_000;
export const DEFAULT_TAIL_TURNS = 2;
export const PRUNED_MASK = "[Old tool result content cleared — re-run the tool or read the file again if needed]";

export function estimateTokens(text: string): number {
  return Math.max(0, Math.ceil(text.length / 4));
}

export function estimateMessage(message: Message): number {
  return estimateTokens(JSON.stringify(message.parts));
}

export interface ContextLimits {
  contextLimit: number;
  outputLimit: number;
}

export function usableTokens(limits: ContextLimits): number {
  const reserved = Math.min(COMPACTION_BUFFER, limits.outputLimit);
  return Math.max(0, limits.contextLimit - reserved);
}

export function isOverflow(totalTokens: number, limits: ContextLimits): boolean {
  if (limits.contextLimit === 0) return false;
  return totalTokens >= usableTokens(limits);
}

/**
 * DCP-style prune: walk newest→oldest, skip the two most recent user turns,
 * stop at any summary boundary; protect the newest PRUNE_PROTECT estimated
 * tokens of tool output; mark older completed tool parts. Returns tokens
 * freed (0 when below the PRUNE_MINIMUM hysteresis — nothing marked).
 */
export function pruneToolOutputs(messages: Message[], now: number = Date.now()): number {
  let userTurns = 0;
  let protectedBudget = 0;
  const candidates: { part: { prunedAt?: number; output?: string }; tokens: number }[] = [];

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.summary) break; // never prune across a compaction boundary
    if (message.role === "user" && !message.compaction) userTurns++;
    if (userTurns < 2) continue; // most recent turns untouched
    for (let j = message.parts.length - 1; j >= 0; j--) {
      const part = message.parts[j]!;
      if (part.type !== "tool" || part.status !== "completed" || !part.output) continue;
      if (part.prunedAt) return commit(candidates, now); // older parts already pruned — stop scanning
      if (PRUNE_PROTECTED_TOOLS.has(part.tool)) continue;
      const tokens = estimateTokens(part.output);
      if (protectedBudget < PRUNE_PROTECT) {
        protectedBudget += tokens;
        continue;
      }
      candidates.push({ part, tokens });
    }
  }
  return commit(candidates, now);
}

function commit(candidates: { part: { prunedAt?: number }; tokens: number }[], now: number): number {
  const total = candidates.reduce((sum, c) => sum + c.tokens, 0);
  if (total <= PRUNE_MINIMUM) return 0;
  for (const candidate of candidates) candidate.part.prunedAt = now;
  return total;
}

/**
 * Pick the compaction split: everything before `tailStartId` is summarized;
 * the tail (last `tailTurns` user turns that fit the recent-token budget)
 * survives verbatim.
 */
export function selectCompaction(
  messages: Message[],
  limits: ContextLimits,
  tailTurns: number = DEFAULT_TAIL_TURNS,
  preserveRecentTokens?: number,
): { head: Message[]; tailStartId?: string } {
  const budget = preserveRecentTokens ?? Math.min(8_000, Math.max(2_000, Math.floor(usableTokens(limits) * 0.25)));

  // Turn boundaries: indexes of "real" user messages — not compaction triggers
  // and not synthetic (shell echoes, continue prompts). Prior summary messages
  // are role=assistant so they never appear here.
  const turnStarts: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!;
    if (message.role === "user" && !message.compaction && !message.parts.every((p) => p.type === "text" && p.synthetic)) {
      turnStarts.push(i);
    }
  }

  let tailStart = messages.length; // default: no tail fits
  let spent = 0;
  const lastTurns = turnStarts.slice(-tailTurns);
  for (let t = lastTurns.length - 1; t >= 0; t--) {
    const start = lastTurns[t]!;
    const end = t + 1 < lastTurns.length ? lastTurns[t + 1]! : messages.length;
    const size = messages.slice(start, end).reduce((sum, m) => sum + estimateMessage(m), 0);
    if (spent + size > budget) break;
    spent += size;
    tailStart = start;
  }

  // The most recent user turn ALWAYS survives verbatim, even if it blows the
  // budget (a huge paste): otherwise the rendered request ends with an
  // assistant message — an illegal prefill that 400s — and the user's message
  // is summarized away and lost.
  if (tailStart === messages.length && turnStarts.length > 0) tailStart = turnStarts[turnStarts.length - 1]!;

  return {
    head: messages.slice(0, tailStart),
    tailStartId: tailStart < messages.length ? messages[tailStart]!.id : undefined,
  };
}

/** The anchored-summary prompt (OpenCode's template — battle-tested; keep verbatim). */
export function buildSummaryPrompt(previousSummary?: string): string {
  const intro = previousSummary
    ? `Update the anchored summary below using the conversation history above.
Preserve still-true details, remove stale details, and merge in the new facts.
<previous-summary>
${previousSummary}
</previous-summary>`
    : `Create a new anchored summary from the conversation history above.`;
  return `${intro}
Output exactly the Markdown structure shown inside <template> and keep the section order unchanged. Do not include the <template> tags in your response.
<template>
## Objective
- [one or two brief sentences describing what the user is trying to accomplish]

## Important Details
- [constraints/preferences, decisions and why, important facts/assumptions, exact context needed to continue, or "(none)"]

## Work State
### Completed
- [finished work, verified facts, or changes made; otherwise "(none)"]

### Active
- [current work, partial changes, or investigation state; otherwise "(none)"]

### Blocked
- [blockers, failing commands, or unknowns; otherwise "(none)"]

## Next Move
1. [immediate concrete action, or "(none)"]
2. [next action if known, or "(none)"]

## Relevant Files
- [file or directory path: why it matters, or "(none)"]
</template>

Rules:
- Keep every section, even when empty.
- Use terse bullets, not prose paragraphs.
- Preserve exact file paths, symbols, commands, error strings, URLs, and identifiers when known.
- Do not mention the summary process or that context was compacted.`;
}

/**
 * Rebuild visible history after compactions (the filterCompacted dance):
 * find the latest completed compaction (user msg with `compaction` + a
 * later assistant with `summary` and clean finish), then emit
 * [compaction-user, summary, ...tail(older, verbatim), ...post-summary].
 * Everything older is invisible to the model but stays on disk.
 */
export function filterCompacted(messages: Message[]): Message[] {
  let compactionIndex = -1;
  let summaryIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]!;
    if (message.role === "assistant" && message.summary && message.finish && message.finish !== "error") {
      // Find its trigger (the nearest earlier compaction user message).
      for (let j = i - 1; j >= 0; j--) {
        if (messages[j]!.compaction) {
          compactionIndex = j;
          summaryIndex = i;
          break;
        }
      }
      if (compactionIndex >= 0) break;
    }
  }
  if (compactionIndex < 0 || summaryIndex < 0) return messages;

  const trigger = messages[compactionIndex]!;
  const tailStartId = trigger.compaction?.tailStartId;
  let tailIndex = compactionIndex; // no tail → empty slice
  if (tailStartId) {
    const found = messages.findIndex((m) => m.id === tailStartId);
    if (found >= 0 && found < compactionIndex) tailIndex = found;
  }

  return [
    ...messages.slice(compactionIndex, summaryIndex + 1), // trigger + summary (+ anything between)
    // Retained tail (older, verbatim). A PRIOR compaction's trigger/summary can
    // sit in this slice; keeping them would resurrect stale summaries and grow
    // context every compaction, so drop them.
    ...messages.slice(tailIndex, compactionIndex).filter((m) => !m.compaction && !m.summary),
    ...messages.slice(summaryIndex + 1), // post-compaction conversation
  ];
}

/** Total estimated tokens for a rendered message list (pre-flight signal only). */
export function estimateHistory(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateMessage(m), 0);
}
