/**
 * Project Manager
 *
 * CRUD operations for Projects in chrome.storage.local.
 */

import {
  Project,
  ProjectSchema,
  WorkerSource,
  WorkerSourceSchema,
  STORAGE_KEYS,
} from './types';
import { cleanupProjectSandbox } from '../services/opfs-sandbox';

/**
 * Generate a unique ID.
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Project Manager service for managing Golem Forge projects.
 */
export class ProjectManager {
  // ─────────────────────────────────────────────────────────────────────────
  // Project CRUD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all projects.
   */
  async listProjects(): Promise<Project[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROJECTS);
    const projects = result[STORAGE_KEYS.PROJECTS] || [];
    return projects.map((p: unknown) => ProjectSchema.parse(p));
  }

  /**
   * Get a project by ID.
   */
  async getProject(id: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === id) || null;
  }

  /**
   * Create a new project.
   */
  async createProject(
    data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      ...data,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      workerSources: data.workerSources || [],
      triggers: data.triggers || [],
      githubBranch: data.githubBranch || 'main',
    };

    const validated = ProjectSchema.parse(project);
    const projects = await this.listProjects();
    projects.push(validated);

    await chrome.storage.local.set({ [STORAGE_KEYS.PROJECTS]: projects });
    return validated;
  }

  /**
   * Update an existing project.
   */
  async updateProject(
    id: string,
    updates: Partial<Omit<Project, 'id' | 'createdAt'>>
  ): Promise<Project> {
    const projects = await this.listProjects();
    const index = projects.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error(`Project not found: ${id}`);
    }

    const updated: Project = {
      ...projects[index],
      ...updates,
      updatedAt: Date.now(),
    };

    const validated = ProjectSchema.parse(updated);
    projects[index] = validated;

    await chrome.storage.local.set({ [STORAGE_KEYS.PROJECTS]: projects });
    return validated;
  }

  /**
   * Delete a project.
   */
  async deleteProject(id: string): Promise<void> {
    const projects = await this.listProjects();
    const filtered = projects.filter((p) => p.id !== id);

    if (filtered.length === projects.length) {
      throw new Error(`Project not found: ${id}`);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.PROJECTS]: filtered });

    // Clean up OPFS storage for this project
    await cleanupProjectSandbox(id);
  }

  /**
   * Ensure at least one default project exists.
   * This handles the case where the extension was installed before
   * default project creation was added, or storage was cleared.
   */
  async ensureDefaultProject(): Promise<Project> {
    const projects = await this.listProjects();

    if (projects.length > 0) {
      return projects[0];
    }

    // Create default project
    console.log('[GolemForge] Creating default project');
    return this.createProject({
      name: 'Default Project',
      description: 'Your first Golem Forge project',
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

    // Remove this source from all projects
    const projects = await this.listProjects();
    const updatedProjects = projects.map((p) => ({
      ...p,
      workerSources: p.workerSources.filter((sid) => sid !== id),
    }));

    await chrome.storage.local.set({ [STORAGE_KEYS.PROJECTS]: updatedProjects });
  }

  /**
   * Add a worker source to a project.
   */
  async addSourceToProject(
    projectId: string,
    sourceId: string
  ): Promise<Project> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const source = await this.getWorkerSource(sourceId);
    if (!source) {
      throw new Error(`Worker source not found: ${sourceId}`);
    }

    if (project.workerSources.includes(sourceId)) {
      return project; // Already added
    }

    return this.updateProject(projectId, {
      workerSources: [...project.workerSources, sourceId],
    });
  }

  /**
   * Remove a worker source from a project.
   */
  async removeSourceFromProject(
    projectId: string,
    sourceId: string
  ): Promise<Project> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    return this.updateProject(projectId, {
      workerSources: project.workerSources.filter((id) => id !== sourceId),
    });
  }
}

// Singleton instance
export const projectManager = new ProjectManager();
