/**
 * Program Manager
 *
 * CRUD operations for Programs in chrome.storage.local.
 */

import {
  Program,
  ProgramSchema,
  WorkerSource,
  WorkerSourceSchema,
  STORAGE_KEYS,
} from './types';
import { cleanupProgramSandbox } from '../services/opfs-sandbox';

/**
 * Generate a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Program Manager service for managing Golem Forge programs.
 */
export class ProgramManager {
  // ─────────────────────────────────────────────────────────────────────────
  // Program CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all programs.
   */
  async listPrograms(): Promise<Program[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROGRAMS);
    const programs = result[STORAGE_KEYS.PROGRAMS] || [];
    return programs.map((p: unknown) => ProgramSchema.parse(p));
  }

  /**
   * Get a program by ID.
   */
  async getProgram(id: string): Promise<Program | null> {
    const programs = await this.listPrograms();
    return programs.find((p) => p.id === id) || null;
  }

  /**
   * Create a new program.
   */
  async createProgram(
    data: Omit<Program, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Program> {
    const now = Date.now();
    const program: Program = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      workerSources: data.workerSources || [],
      triggers: data.triggers || [],
      githubBranch: data.githubBranch || 'main',
    };

    const validated = ProgramSchema.parse(program);
    const programs = await this.listPrograms();
    programs.push(validated);

    await chrome.storage.local.set({ [STORAGE_KEYS.PROGRAMS]: programs });
    return validated;
  }

  /**
   * Update an existing program.
   */
  async updateProgram(
    id: string,
    updates: Partial<Omit<Program, 'id' | 'createdAt'>>
  ): Promise<Program> {
    const programs = await this.listPrograms();
    const index = programs.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Program not found: ${id}`);
    }

    const updated: Program = {
      ...programs[index],
      ...updates,
      updatedAt: Date.now(),
    };

    const validated = ProgramSchema.parse(updated);
    programs[index] = validated;

    await chrome.storage.local.set({ [STORAGE_KEYS.PROGRAMS]: programs });
    return validated;
  }

  /**
   * Delete a program.
   */
  async deleteProgram(id: string): Promise<void> {
    const programs = await this.listPrograms();
    const filtered = programs.filter((p) => p.id !== id);

    if (filtered.length === programs.length) {
      throw new Error(`Program not found: ${id}`);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.PROGRAMS]: filtered });

    // Clean up OPFS storage for this program
    await cleanupProgramSandbox(id);
  }

  /**
   * Ensure at least one default program exists.
   * This handles the case where the extension was installed before
   * default program creation was added, or storage was cleared.
   */
  async ensureDefaultProgram(): Promise<Program> {
    const programs = await this.listPrograms();

    if (programs.length > 0) {
      return programs[0];
    }

    // Create default program
    console.log('[GolemForge] Creating default program');
    return this.createProgram({
      name: 'Default Program',
      description: 'Your first Golem Forge program',
      workerSources: [],
      githubBranch: 'main',
      triggers: [],
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Worker Source Management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all worker sources.
   */
  async listWorkerSources(): Promise<WorkerSource[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.WORKER_SOURCES);
    const sources = result[STORAGE_KEYS.WORKER_SOURCES] || [];
    return sources.map((s: unknown) => WorkerSourceSchema.parse(s));
  }

  /**
   * Get a worker source by ID.
   */
  async getWorkerSource(id: string): Promise<WorkerSource | null> {
    const sources = await this.listWorkerSources();
    return sources.find((s) => s.id === id) || null;
  }

  /**
   * Add a worker source.
   */
  async addWorkerSource(
    source: Omit<WorkerSource, 'id'>
  ): Promise<WorkerSource> {
    const withId = {
      ...source,
      id: generateId(),
    } as WorkerSource;

    const validated = WorkerSourceSchema.parse(withId);
    const sources = await this.listWorkerSources();
    sources.push(validated);

    await chrome.storage.local.set({ [STORAGE_KEYS.WORKER_SOURCES]: sources });
    return validated;
  }

  /**
   * Update a worker source.
   */
  async updateWorkerSource(
    id: string,
    updates: Partial<Omit<WorkerSource, 'id' | 'type'>>
  ): Promise<WorkerSource> {
    const sources = await this.listWorkerSources();
    const index = sources.findIndex((s) => s.id === id);

    if (index === -1) {
      throw new Error(`Worker source not found: ${id}`);
    }

    const updated = {
      ...sources[index],
      ...updates,
    } as WorkerSource;

    const validated = WorkerSourceSchema.parse(updated);
    sources[index] = validated;

    await chrome.storage.local.set({ [STORAGE_KEYS.WORKER_SOURCES]: sources });
    return validated;
  }

  /**
   * Delete a worker source.
   */
  async deleteWorkerSource(id: string): Promise<void> {
    const sources = await this.listWorkerSources();
    const filtered = sources.filter((s) => s.id !== id);

    if (filtered.length === sources.length) {
      throw new Error(`Worker source not found: ${id}`);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.WORKER_SOURCES]: filtered });

    // Remove this source from all programs
    const programs = await this.listPrograms();
    const updatedPrograms = programs.map((p) => ({
      ...p,
      workerSources: p.workerSources.filter((sid) => sid !== id),
    }));

    await chrome.storage.local.set({ [STORAGE_KEYS.PROGRAMS]: updatedPrograms });
  }

  /**
   * Add a worker source to a program.
   */
  async addSourceToProgram(
    programId: string,
    sourceId: string
  ): Promise<Program> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw new Error(`Program not found: ${programId}`);
    }

    const source = await this.getWorkerSource(sourceId);
    if (!source) {
      throw new Error(`Worker source not found: ${sourceId}`);
    }

    if (program.workerSources.includes(sourceId)) {
      return program; // Already added
    }

    return this.updateProgram(programId, {
      workerSources: [...program.workerSources, sourceId],
    });
  }

  /**
   * Remove a worker source from a program.
   */
  async removeSourceFromProgram(
    programId: string,
    sourceId: string
  ): Promise<Program> {
    const program = await this.getProgram(programId);
    if (!program) {
      throw new Error(`Program not found: ${programId}`);
    }

    return this.updateProgram(programId, {
      workerSources: program.workerSources.filter((id) => id !== sourceId),
    });
  }
}

// Singleton instance
export const programManager = new ProgramManager();
