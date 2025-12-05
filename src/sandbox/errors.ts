/**
 * Sandbox Errors
 *
 * Error types for sandbox operations with LLM-friendly messages.
 */

/**
 * Base class for all sandbox errors.
 */
export class SandboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'SandboxError';
  }

  /**
   * Get an LLM-friendly error message.
   */
  toLLMMessage(): string {
    return this.message;
  }
}

/**
 * Thrown when a file or directory is not found.
 */
export class NotFoundError extends SandboxError {
  constructor(path: string) {
    super('NOT_FOUND', `File or directory not found: ${path}`, path);
    this.name = 'NotFoundError';
  }

  toLLMMessage(): string {
    return `File not found: ${this.path}. Please check the path and try again.`;
  }
}

/**
 * Thrown when a path is invalid or attempts to escape boundaries.
 */
export class InvalidPathError extends SandboxError {
  constructor(message: string, path?: string) {
    super('INVALID_PATH', message, path);
    this.name = 'InvalidPathError';
  }

  toLLMMessage(): string {
    return `Invalid path${this.path ? ` "${this.path}"` : ''}: ${this.message}`;
  }
}

/**
 * Type guard for SandboxError.
 */
export function isSandboxError(error: unknown): error is SandboxError {
  return error instanceof SandboxError;
}
