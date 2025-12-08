/**
 * Tests for Sandbox Error Classes
 */

import { describe, it, expect } from 'vitest';
import {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  ReadOnlyError,
  PermissionEscalationError,
  isSandboxError,
} from './sandbox-errors.js';

describe('SandboxError', () => {
  it('creates error with code, message, and path', () => {
    const error = new SandboxError('TEST_CODE', 'Test message', '/test/path');

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.path).toBe('/test/path');
    expect(error.name).toBe('SandboxError');
  });

  it('creates error without path', () => {
    const error = new SandboxError('TEST_CODE', 'Test message');

    expect(error.code).toBe('TEST_CODE');
    expect(error.message).toBe('Test message');
    expect(error.path).toBeUndefined();
  });

  it('toLLMMessage returns the message', () => {
    const error = new SandboxError('TEST_CODE', 'Test message');
    expect(error.toLLMMessage()).toBe('Test message');
  });

  it('is instanceof Error', () => {
    const error = new SandboxError('TEST_CODE', 'Test message');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  it('creates error with path', () => {
    const error = new NotFoundError('/missing/file.txt');

    expect(error.code).toBe('NOT_FOUND');
    expect(error.path).toBe('/missing/file.txt');
    expect(error.name).toBe('NotFoundError');
    expect(error.message).toBe('File or directory not found: /missing/file.txt');
  });

  it('toLLMMessage provides helpful guidance', () => {
    const error = new NotFoundError('/missing/file.txt');
    expect(error.toLLMMessage()).toBe(
      'File not found: /missing/file.txt. Please check the path and try again.'
    );
  });

  it('is instanceof SandboxError', () => {
    const error = new NotFoundError('/path');
    expect(error).toBeInstanceOf(SandboxError);
  });
});

describe('InvalidPathError', () => {
  it('creates error with message and path', () => {
    const error = new InvalidPathError('Path escapes sandbox', '/../escape');

    expect(error.code).toBe('INVALID_PATH');
    expect(error.path).toBe('/../escape');
    expect(error.name).toBe('InvalidPathError');
    expect(error.message).toBe('Path escapes sandbox');
  });

  it('creates error without path', () => {
    const error = new InvalidPathError('Relative paths not allowed');

    expect(error.code).toBe('INVALID_PATH');
    expect(error.path).toBeUndefined();
  });

  it('toLLMMessage includes path when available', () => {
    const error = new InvalidPathError('Path escapes sandbox', '/../escape');
    expect(error.toLLMMessage()).toBe('Invalid path "/../escape": Path escapes sandbox');
  });

  it('toLLMMessage works without path', () => {
    const error = new InvalidPathError('Relative paths not allowed');
    expect(error.toLLMMessage()).toBe('Invalid path: Relative paths not allowed');
  });
});

describe('ReadOnlyError', () => {
  it('creates error with path', () => {
    const error = new ReadOnlyError('/readonly/file.txt');

    expect(error.code).toBe('READ_ONLY');
    expect(error.path).toBe('/readonly/file.txt');
    expect(error.name).toBe('ReadOnlyError');
    expect(error.message).toBe('Cannot write to read-only path: /readonly/file.txt');
  });

  it('toLLMMessage provides clear feedback', () => {
    const error = new ReadOnlyError('/readonly/file.txt');
    expect(error.toLLMMessage()).toBe(
      'Cannot write to /readonly/file.txt: this location is read-only.'
    );
  });
});

describe('PermissionEscalationError', () => {
  it('creates error with message and path', () => {
    const error = new PermissionEscalationError(
      'Cannot grant write access to read-only mount',
      '/workspace'
    );

    expect(error.code).toBe('PERMISSION_ESCALATION');
    expect(error.path).toBe('/workspace');
    expect(error.name).toBe('PermissionEscalationError');
  });

  it('toLLMMessage includes the message', () => {
    const error = new PermissionEscalationError('Cannot grant write access');
    expect(error.toLLMMessage()).toBe('Permission denied: Cannot grant write access');
  });
});

describe('isSandboxError', () => {
  it('returns true for SandboxError', () => {
    expect(isSandboxError(new SandboxError('CODE', 'msg'))).toBe(true);
  });

  it('returns true for NotFoundError', () => {
    expect(isSandboxError(new NotFoundError('/path'))).toBe(true);
  });

  it('returns true for InvalidPathError', () => {
    expect(isSandboxError(new InvalidPathError('msg'))).toBe(true);
  });

  it('returns true for ReadOnlyError', () => {
    expect(isSandboxError(new ReadOnlyError('/path'))).toBe(true);
  });

  it('returns true for PermissionEscalationError', () => {
    expect(isSandboxError(new PermissionEscalationError('msg'))).toBe(true);
  });

  it('returns false for regular Error', () => {
    expect(isSandboxError(new Error('msg'))).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isSandboxError(null)).toBe(false);
    expect(isSandboxError(undefined)).toBe(false);
    expect(isSandboxError('error')).toBe(false);
    expect(isSandboxError({ code: 'FAKE' })).toBe(false);
  });
});
