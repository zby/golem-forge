/**
 * Staging Manager
 *
 * Manages staged commits for the git sync workflow.
 * Extracted from SandboxImpl for separation of concerns.
 */

import {
  Zone,
  StageRequest,
  StagedCommit,
  StagedFile,
} from './types.js';
import { SandboxBackend } from './interface.js';
import { NotFoundError, InvalidPathError } from './errors.js';

/**
 * Normalize and validate a repo path to prevent path traversal attacks.
 * Rejects paths containing ".." segments that could escape the staging directory.
 *
 * @param repoPath - The repository path to validate
 * @returns The normalized path
 * @throws InvalidPathError if path contains traversal attempts
 */
function normalizeRepoPath(repoPath: string): string {
  // Normalize path separators to forward slashes
  const normalized = repoPath.replace(/\\/g, '/');

  // Split into segments and check each one
  const segments = normalized.split('/').filter(s => s.length > 0);

  // Reject any ".." segments
  if (segments.some(seg => seg === '..')) {
    throw new InvalidPathError(
      `Path contains ".." which could escape the staging directory`,
      repoPath
    );
  }

  // Reject paths starting with /
  if (normalized.startsWith('/')) {
    throw new InvalidPathError(
      `Path must be relative (cannot start with /)`,
      repoPath
    );
  }

  // Reconstruct as clean relative path
  return segments.join('/');
}

/**
 * Generate a UUID that works in both Node.js and browsers.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a simple content hash.
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Permission checker callback type.
 */
export type PermissionChecker = (
  operation: 'write' | 'delete',
  path: string
) => Promise<void>;

/**
 * Serializable staged commit for persistence.
 */
interface PersistedStagedCommit {
  id: string;
  sessionId: string;
  createdAt: string; // ISO date string
  message: string;
  files: StagedFile[];
  status: 'pending' | 'approved' | 'committed' | 'rejected';
}

/**
 * Index file structure for persisted staged commits.
 */
interface StagedCommitsIndex {
  version: 1;
  commits: PersistedStagedCommit[];
}

/**
 * Options for creating a StagingManager.
 */
export interface StagingManagerOptions {
  backend: SandboxBackend;
  sessionId: string;
  checkPermission: PermissionChecker;
}

/**
 * Name of the index file that stores staged commit metadata.
 */
const STAGED_INDEX_FILE = '.staged-commits.json';

/**
 * Manages staged commits.
 */
export class StagingManager {
  private backend: SandboxBackend;
  private sessionId: string;
  private checkPermission: PermissionChecker;
  private stagedCommits: Map<string, StagedCommit> = new Map();
  private initialized = false;

  constructor(options: StagingManagerOptions) {
    this.backend = options.backend;
    this.sessionId = options.sessionId;
    this.checkPermission = options.checkPermission;
  }

  /**
   * Initialize the staging manager by loading persisted commits.
   * Must be called before using other methods.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.loadIndex();
    this.initialized = true;
  }

  /**
   * Get the path to the staged commits index file.
   */
  private getIndexPath(): string {
    return this.backend.mapVirtualToReal(`/staged/${STAGED_INDEX_FILE}`, Zone.STAGED);
  }

  /**
   * Load the staged commits index from disk.
   */
  private async loadIndex(): Promise<void> {
    const indexPath = this.getIndexPath();

    try {
      if (await this.backend.exists(indexPath)) {
        const content = await this.backend.readFile(indexPath);
        const index: StagedCommitsIndex = JSON.parse(content);

        // Convert persisted format back to StagedCommit
        for (const persisted of index.commits) {
          const commit: StagedCommit = {
            id: persisted.id,
            sessionId: persisted.sessionId,
            createdAt: new Date(persisted.createdAt),
            message: persisted.message,
            files: persisted.files,
            status: persisted.status,
          };
          this.stagedCommits.set(commit.id, commit);
        }
      }
    } catch {
      // If index is corrupted or unreadable, start fresh
      // The files may still exist on disk
      this.stagedCommits.clear();
    }
  }

  /**
   * Save the staged commits index to disk.
   */
  private async saveIndex(): Promise<void> {
    const indexPath = this.getIndexPath();

    // Convert Map to serializable format
    const commits: PersistedStagedCommit[] = Array.from(this.stagedCommits.values()).map(c => ({
      id: c.id,
      sessionId: c.sessionId,
      createdAt: c.createdAt.toISOString(),
      message: c.message,
      files: c.files,
      status: c.status,
    }));

    const index: StagedCommitsIndex = {
      version: 1,
      commits,
    };

    // Ensure the staged directory exists
    const stagedDir = this.backend.mapVirtualToReal('/staged', Zone.STAGED);
    if (!(await this.backend.exists(stagedDir))) {
      await this.backend.mkdir(stagedDir);
    }

    await this.backend.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Stage files for commit.
   */
  async stage(files: StageRequest[], message: string): Promise<string> {
    await this.initialize();

    const commitId = generateId();
    const stagedFiles: StagedFile[] = [];

    for (const file of files) {
      // Normalize and validate the repo path to prevent path traversal
      const safeRepoPath = normalizeRepoPath(file.repoPath);
      const stagePath = `/staged/${commitId}/${safeRepoPath}`;

      // Check write permission
      await this.checkPermission('write', stagePath);

      // Write file to staging area
      const realPath = this.backend.mapVirtualToReal(stagePath, Zone.STAGED);
      await this.ensureParentDir(realPath);
      await this.backend.writeFile(realPath, file.content);

      stagedFiles.push({
        repoPath: safeRepoPath,
        operation: 'create',
        size: file.content.length,
        hash: hashContent(file.content),
      });
    }

    const stagedCommit: StagedCommit = {
      id: commitId,
      sessionId: this.sessionId,
      createdAt: new Date(),
      message,
      files: stagedFiles,
      status: 'pending',
    };

    this.stagedCommits.set(commitId, stagedCommit);

    // Persist the updated index
    await this.saveIndex();

    return commitId;
  }

  /**
   * Get all staged commits.
   */
  async getStagedCommits(): Promise<StagedCommit[]> {
    await this.initialize();
    return Array.from(this.stagedCommits.values());
  }

  /**
   * Get a specific staged commit.
   */
  async getStagedCommit(commitId: string): Promise<StagedCommit> {
    await this.initialize();
    const commit = this.stagedCommits.get(commitId);
    if (!commit) {
      throw new NotFoundError(`/staged/${commitId}`);
    }
    return commit;
  }

  /**
   * Discard a staged commit.
   */
  async discardStaged(commitId: string): Promise<void> {
    await this.initialize();

    const commit = this.stagedCommits.get(commitId);
    if (!commit) {
      throw new NotFoundError(`/staged/${commitId}`);
    }

    // Check permission to delete
    await this.checkPermission('delete', `/staged/${commitId}`);

    // Delete all staged files
    for (const file of commit.files) {
      const stagePath = `/staged/${commitId}/${file.repoPath}`;
      const realPath = this.backend.mapVirtualToReal(stagePath, Zone.STAGED);
      if (await this.backend.exists(realPath)) {
        await this.backend.deleteFile(realPath);
      }
    }

    this.stagedCommits.delete(commitId);

    // Persist the updated index
    await this.saveIndex();
  }

  /**
   * Get commit ID for a staged commit (for audit logging).
   */
  getCommitInfo(commitId: string): { fileCount: number; message: string } | null {
    const commit = this.stagedCommits.get(commitId);
    if (!commit) return null;
    return { fileCount: commit.files.length, message: commit.message };
  }

  private async ensureParentDir(realPath: string): Promise<void> {
    const parts = realPath.split('/');
    parts.pop();
    const parentDir = parts.join('/');
    if (parentDir && !(await this.backend.exists(parentDir))) {
      await this.backend.mkdir(parentDir);
    }
  }
}
