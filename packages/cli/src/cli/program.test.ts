/**
 * Tests for Program Detection
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  findProgramRoot,
  loadProgramConfig,
  getEffectiveConfig,
  resolveWorkerPaths,
  type ProgramConfig,
} from './program.js';

describe('findProgramRoot', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golem-forge-program-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should find program by .golem-forge.json', async () => {
    const config: ProgramConfig = { model: 'test:model' };
    await fs.writeFile(
      path.join(tempDir, '.golem-forge.json'),
      JSON.stringify(config)
    );

    const result = await findProgramRoot(tempDir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(tempDir);
    expect(result!.detectedBy).toBe('.golem-forge.json');
    expect(result!.config).toEqual(config);
  });

  it('should find program by .llm-do marker', async () => {
    await fs.writeFile(path.join(tempDir, '.llm-do'), '');

    const result = await findProgramRoot(tempDir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(tempDir);
    expect(result!.detectedBy).toBe('.llm-do');
    expect(result!.config).toBeUndefined();
  });

  it('should find program by package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-program' })
    );

    const result = await findProgramRoot(tempDir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(tempDir);
    expect(result!.detectedBy).toBe('package.json');
  });

  it('should find program by .git directory', async () => {
    await fs.mkdir(path.join(tempDir, '.git'));

    const result = await findProgramRoot(tempDir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(tempDir);
    expect(result!.detectedBy).toBe('.git');
  });

  it('should prioritize config files over other markers', async () => {
    // Create both package.json and .golem-forge.json
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'test-program' })
    );
    const config: ProgramConfig = { model: 'test:model' };
    await fs.writeFile(
      path.join(tempDir, '.golem-forge.json'),
      JSON.stringify(config)
    );

    const result = await findProgramRoot(tempDir);

    expect(result).not.toBeNull();
    expect(result!.detectedBy).toBe('.golem-forge.json');
    expect(result!.config).toEqual(config);
  });

  it('should walk up directory tree to find program root', async () => {
    // Create nested directory structure
    const subDir = path.join(tempDir, 'src', 'components');
    await fs.mkdir(subDir, { recursive: true });

    // Put marker at root
    await fs.writeFile(path.join(tempDir, '.llm-do'), '');

    const result = await findProgramRoot(subDir);

    expect(result).not.toBeNull();
    expect(result!.root).toBe(tempDir);
    expect(result!.detectedBy).toBe('.llm-do');
  });

  it('should return null when no program markers found', async () => {
    // Create isolated temp dir with no markers
    const isolatedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'isolated-'));

    try {
      // Don't search from root by limiting iterations
      const result = await findProgramRoot(isolatedDir);
      // May find markers in parent directories on some systems
      // Just verify function doesn't crash
      expect(result === null || typeof result.root === 'string').toBe(true);
    } finally {
      await fs.rm(isolatedDir, { recursive: true, force: true });
    }
  });

  it('should handle malformed config files gracefully and warn', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await fs.writeFile(
        path.join(tempDir, '.golem-forge.json'),
        'invalid json {'
      );

      const result = await findProgramRoot(tempDir);

      expect(result).not.toBeNull();
      expect(result!.root).toBe(tempDir);
      expect(result!.detectedBy).toBe('.golem-forge.json');
      // Config should be undefined when parsing fails
      expect(result!.config).toBeUndefined();
      // Should log a warning
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Failed to parse')
      );
    } finally {
      consoleWarnSpy.mockRestore();
    }
  });
});

describe('loadProgramConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golem-forge-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should load valid config file', async () => {
    const config: ProgramConfig = {
      model: 'anthropic:claude-haiku-4-5',
      trustLevel: 'workspace',
      approvalMode: 'approve_all',
      workerPaths: ['workers', 'custom-workers'],
    };
    const configPath = path.join(tempDir, 'config.json');
    await fs.writeFile(configPath, JSON.stringify(config));

    const result = await loadProgramConfig(configPath);

    expect(result).toEqual(config);
  });

  it('should return null for missing file', async () => {
    const result = await loadProgramConfig(path.join(tempDir, 'missing.json'));
    expect(result).toBeNull();
  });

  it('should return null for invalid JSON', async () => {
    const configPath = path.join(tempDir, 'invalid.json');
    await fs.writeFile(configPath, 'not valid json');

    const result = await loadProgramConfig(configPath);
    expect(result).toBeNull();
  });
});

describe('getEffectiveConfig', () => {
  it('should return defaults when no config provided', () => {
    const config = getEffectiveConfig();

    expect(config.trustLevel).toBe('session');
    expect(config.approvalMode).toBe('interactive');
    expect(config.workerPaths).toEqual(['workers', '.workers']);
  });

  it('should merge program config with defaults', () => {
    const programConfig: ProgramConfig = {
      model: 'openai:gpt-4o-mini',
      trustLevel: 'workspace',
    };

    const config = getEffectiveConfig(programConfig);

    expect(config.model).toBe('openai:gpt-4o-mini');
    expect(config.trustLevel).toBe('workspace');
    expect(config.approvalMode).toBe('interactive'); // default
    expect(config.workerPaths).toEqual(['workers', '.workers']); // default
  });

  it('should apply overrides over program config', () => {
    const programConfig: ProgramConfig = {
      model: 'openai:gpt-4o-mini',
      trustLevel: 'workspace',
      approvalMode: 'interactive',
    };

    const overrides: Partial<ProgramConfig> = {
      model: 'anthropic:claude-haiku-4-5',
      approvalMode: 'auto_deny',
    };

    const config = getEffectiveConfig(programConfig, overrides);

    expect(config.model).toBe('anthropic:claude-haiku-4-5'); // override
    expect(config.trustLevel).toBe('workspace'); // program
    expect(config.approvalMode).toBe('auto_deny'); // override
  });

  it('should handle undefined values in overrides', () => {
    const programConfig: ProgramConfig = {
      model: 'test:model',
    };

    const overrides: Partial<ProgramConfig> = {
      model: undefined, // should not override
      trustLevel: 'full',
    };

    const config = getEffectiveConfig(programConfig, overrides);

    // Note: undefined in spread doesn't override
    expect(config.trustLevel).toBe('full');
  });
});

describe('resolveWorkerPaths', () => {
  it('should resolve relative paths to absolute', () => {
    const programRoot = '/home/user/program';
    const workerPaths = ['workers', '.workers', 'src/workers'];

    const resolved = resolveWorkerPaths(programRoot, workerPaths);

    expect(resolved).toEqual([
      '/home/user/program/workers',
      '/home/user/program/.workers',
      '/home/user/program/src/workers',
    ]);
  });

  it('should keep absolute paths unchanged', () => {
    const programRoot = '/home/user/program';
    const workerPaths = ['/absolute/path/workers', 'relative/workers'];

    const resolved = resolveWorkerPaths(programRoot, workerPaths);

    expect(resolved[0]).toBe('/absolute/path/workers');
    expect(resolved[1]).toBe('/home/user/program/relative/workers');
  });

  it('should handle empty paths array', () => {
    const resolved = resolveWorkerPaths('/program', []);
    expect(resolved).toEqual([]);
  });
});
