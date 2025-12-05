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
 * Thrown when an operation is not permitted by the security context.
 */
export class PermissionError extends SandboxError {
  constructor(message: string, path?: string) {
    super('PERMISSION_DENIED', message, path);
    this.name = 'PermissionError';
  }

  toLLMMessage(): string {
    if (this.path) {
      return `Permission denied for path "${this.path}": ${this.message}. This file is outside your accessible zones.`;
    }
    return `Permission denied: ${this.message}`;
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
 * Thrown when a file already exists and overwrite is not permitted.
 */
export class FileExistsError extends SandboxError {
  constructor(path: string) {
    super('FILE_EXISTS', `File already exists: ${path}`, path);
    this.name = 'FileExistsError';
  }

  toLLMMessage(): string {
    return `File already exists: ${this.path}. Cannot overwrite in this context.`;
  }
}

/**
 * Thrown when storage quota is exceeded.
 */
export class QuotaExceededError extends SandboxError {
  constructor(message: string = 'Storage quota exceeded') {
    super('QUOTA_EXCEEDED', message);
    this.name = 'QuotaExceededError';
  }

  toLLMMessage(): string {
    return 'Storage quota exceeded. Please delete some files to free up space.';
  }
}

/**
 * Type guard for SandboxError.
 */
export function isSandboxError(error: unknown): error is SandboxError {
  return error instanceof SandboxError;
}
