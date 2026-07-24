/**
 * Question subsystem — an agent-driven multi-choice prompt shown to the user
 * mid-turn. Complementary to the permission ask: permissions gate an action;
 * a question gathers a decision from the user.
 */

export interface QuestionInput {
  /** One-line prompt shown at the top of the picker. */
  title: string;
  /** Choices offered. May be empty when `allowCustom` is true. */
  choices: string[];
  /** Allow a free-text "other" answer. */
  allowCustom?: boolean;
  /** Allow selecting more than one choice. */
  allowMultiple?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  title: string;
  choices: string[];
  allowCustom: boolean;
  allowMultiple: boolean;
}

/** Answer / cancel reply. `values` is always an array; single-select carries one entry. */
export type QuestionReply =
  | { kind: "answer"; values: string[] }
  | { kind: "cancel"; feedback?: string };
