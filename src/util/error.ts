/**
 * Typed error base. Every module defines its errors by extending NamedError,
 * so callers can discriminate on `name` and errors serialize cleanly.
 */
export abstract class NamedError extends Error {
  abstract override readonly name: string;

  toObject(): { name: string; message: string; data?: Record<string, unknown> } {
    return { name: this.name, message: this.message };
  }
}

export class PermissionDeniedError extends NamedError {
  override readonly name = "PermissionDeniedError";
  constructor(
    readonly permission: string,
    readonly pattern: string,
  ) {
    super(`Permission denied: ${permission} (${pattern})`);
  }
}

export class PermissionRejectedError extends NamedError {
  override readonly name = "PermissionRejectedError";
  constructor(readonly feedback?: string) {
    super(feedback ? `Rejected by user: ${feedback}` : "Rejected by user");
  }
}

export class AbortedError extends NamedError {
  override readonly name = "AbortedError";
  constructor() {
    super("Operation aborted");
  }
}

export class InvalidToolArgsError extends NamedError {
  override readonly name = "InvalidToolArgsError";
  constructor(
    readonly tool: string,
    readonly detail: string,
  ) {
    super(`Invalid arguments for tool "${tool}": ${detail}. Rewrite the input to match the schema.`);
  }
}

export class ConfigError extends NamedError {
  override readonly name = "ConfigError";
  constructor(
    readonly path: string,
    readonly detail: string,
  ) {
    super(`Invalid config at ${path}: ${detail}`);
  }
}

export class ProviderError extends NamedError {
  override readonly name = "ProviderError";
  constructor(
    readonly provider: string,
    readonly detail: string,
  ) {
    super(`Provider "${provider}": ${detail}`);
  }
}
