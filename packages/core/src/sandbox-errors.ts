/**
 * Shared Sandbox Errors
 *
 * Error types for sandbox operations with LLM-friendly messages.
 * Used by both CLI and browser implementations.
 *
 * @module shared/sandbox-errors
 */

/**
 * Base class for all sandbox errors.
 *
 * Provides:
 * - Structured error code for programmatic handling
 * - Human-readable message
 * - Optional path for context
 * - LLM-friendly message formatting
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
   * Override in subclasses for better guidance.
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
 * Thrown when attempting to write to a read-only location.
 */
export class ReadOnlyError extends SandboxError {
  constructor(path: string) {
    super('READ_ONLY', `Cannot write to read-only path: ${path}`, path);
    this.name = 'ReadOnlyError';
  }

  toLLMMessage(): string {
    return `Cannot write to ${this.path}: this location is read-only.`;
  }
}

/**
 * Thrown when a permission escalation is attempted.
 */
export class PermissionEscalationError extends SandboxError {
  constructor(message: string, path?: string) {
    super('PERMISSION_ESCALATION', message, path);
    this.name = 'PermissionEscalationError';
  }

  toLLMMessage(): string {
    return `Permission denied: ${this.message}`;
  }
}

/**
 * Type guard for SandboxError and its subclasses.
 */
export function isSandboxError(error: unknown): error is SandboxError {
  return error instanceof SandboxError;
}
