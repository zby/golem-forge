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
import { NotFoundError } from './errors.js';

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
 * Options for creating a StagingManager.
 */
export interface StagingManagerOptions {
  backend: SandboxBackend;
  sessionId: string;
  checkPermission: PermissionChecker;
}

/**
 * Manages staged commits.
 */
export class StagingManager {
  private backend: SandboxBackend;
  private sessionId: string;
  private checkPermission: PermissionChecker;
  private stagedCommits: Map<string, StagedCommit> = new Map();

  constructor(options: StagingManagerOptions) {
    this.backend = options.backend;
    this.sessionId = options.sessionId;
    this.checkPermission = options.checkPermission;
  }

  /**
   * Stage files for commit.
   */
  async stage(files: StageRequest[], message: string): Promise<string> {
    const commitId = generateId();
    const stagedFiles: StagedFile[] = [];

    for (const file of files) {
      const stagePath = `/staged/${commitId}/${file.repoPath}`;

      // Check write permission
      await this.checkPermission('write', stagePath);

      // Write file to staging area
      const realPath = this.backend.mapVirtualToReal(stagePath, Zone.STAGED);
      await this.ensureParentDir(realPath);
      await this.backend.writeFile(realPath, file.content);

      stagedFiles.push({
        repoPath: file.repoPath,
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
    return commitId;
  }

  /**
   * Get all staged commits.
   */
  async getStagedCommits(): Promise<StagedCommit[]> {
    return Array.from(this.stagedCommits.values());
  }

  /**
   * Get a specific staged commit.
   */
  async getStagedCommit(commitId: string): Promise<StagedCommit> {
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
