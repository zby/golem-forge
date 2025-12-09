/**
 * Isomorphic Git Backend
 *
 * Platform-agnostic git backend using isomorphic-git library.
 * Works in both Node.js (CLI) and browser (Chrome extension).
 *
 * Authentication: Uses HTTPS with PAT (Personal Access Token).
 * SSH keys are NOT supported by isomorphic-git.
 *
 * Environment variables (CLI):
 * - GITHUB_TOKEN or GH_TOKEN: GitHub Personal Access Token
 *
 * Browser: Token must be provided via constructor options.
 */

import * as git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import type {
  GitBackend,
  CreateStagedCommitInput,
  PushInput,
  PullInput,
  DiffSummary,
} from './backend.js';
import type {
  StagedCommit,
  StagedCommitData,
  StagedFile,
  GitTarget,
  PushResult,
  BranchListResult,
  BinaryData,
} from './types.js';
import { GitError, GitAuthError } from './types.js';
import { generateDiff, computeDiffStats } from './merge.js';

/**
 * Options for IsomorphicGitBackend.
 */
export interface IsomorphicGitBackendOptions {
  /**
   * File system operations interface.
   * In CLI: Use node fs wrapped for isomorphic-git
   * In Browser: Use OPFS-based implementation
   */
  fs: IsomorphicFs;

  /**
   * Working directory path.
   * This is where the git repository lives.
   */
  dir: string;

  /**
   * GitHub token for authentication.
   * If not provided, will try environment variables (CLI only).
   */
  token?: string;

  /**
   * Author name for commits.
   * Defaults to 'Golem Forge'.
   */
  authorName?: string;

  /**
   * Author email for commits.
   * Defaults to 'golem@forge.local'.
   */
  authorEmail?: string;
}

/**
 * File system interface compatible with isomorphic-git.
 * This is a subset of node:fs/promises API.
 */
export interface IsomorphicFs {
  promises: {
    readFile(path: string): Promise<Uint8Array>;
    readFile(path: string, options: { encoding: 'utf8' }): Promise<string>;
    writeFile(path: string, data: string | Uint8Array): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    rmdir(path: string): Promise<void>;
    stat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>;
    lstat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }>;
  };
}

/**
 * Generate a unique ID for staged commits.
 */
function generateId(): string {
  return `staged-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Compute SHA-256 hash of content.
 */
async function hashContent(content: BinaryData): Promise<string> {
  // Use SubtleCrypto for cross-platform compatibility
  const hashBuffer = await crypto.subtle.digest('SHA-256', content);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Isomorphic Git Backend implementation.
 *
 * Uses isomorphic-git for all git operations, making it work
 * in both Node.js and browser environments.
 */
export class IsomorphicGitBackend implements GitBackend {
  private fs: IsomorphicFs;
  private dir: string;
  private token?: string;
  private authorName: string;
  private authorEmail: string;

  // In-memory storage for staged commits
  private stagedCommits: Map<string, StagedCommitData> = new Map();

  constructor(options: IsomorphicGitBackendOptions) {
    this.fs = options.fs;
    this.dir = options.dir;
    this.token = options.token;
    this.authorName = options.authorName ?? 'Golem Forge';
    this.authorEmail = options.authorEmail ?? 'golem@forge.local';
  }

  /**
   * Get authentication credentials.
   * Throws GitAuthError if no token is available.
   */
  private getAuth(): { username: string; password: string } {
    // Try constructor token first
    let token = this.token;

    // Fall back to environment variables (CLI only)
    if (!token && typeof process !== 'undefined' && process.env) {
      token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    }

    if (!token) {
      throw new GitAuthError(
        'No GitHub token found. ' +
        'Set GITHUB_TOKEN environment variable or provide token in options.'
      );
    }

    return { username: 'token', password: token };
  }

  /**
   * Convert GitTarget to repository URL.
   */
  private targetToUrl(target: GitTarget): string {
    switch (target.type) {
      case 'github':
        return `https://github.com/${target.repo}.git`;
      case 'local':
        return target.path;
      case 'local-bare':
        return target.path;
      default:
        throw new GitError(`Unknown target type: ${(target as GitTarget).type}`);
    }
  }

  // ============================================================================
  // Staging Operations
  // ============================================================================

  async createStagedCommit(input: CreateStagedCommitInput): Promise<StagedCommit> {
    const id = generateId();
    const files: StagedFile[] = [];
    const contents = new Map<string, BinaryData>();

    for (const file of input.files) {
      const contentHash = await hashContent(file.content);
      files.push({
        sandboxPath: file.sandboxPath,
        operation: 'update', // TODO: Detect create vs update
        contentHash,
        size: file.content.length,
      });
      contents.set(file.sandboxPath, file.content);
    }

    const commit: StagedCommitData = {
      id,
      message: input.message,
      files,
      createdAt: new Date(),
      contents,
    };

    this.stagedCommits.set(id, commit);

    return {
      id: commit.id,
      message: commit.message,
      files: commit.files,
      createdAt: commit.createdAt,
    };
  }

  async getStagedCommit(id: string): Promise<StagedCommit | null> {
    const commit = this.stagedCommits.get(id);
    if (!commit) return null;

    return {
      id: commit.id,
      message: commit.message,
      files: commit.files,
      createdAt: commit.createdAt,
    };
  }

  async listStagedCommits(): Promise<StagedCommit[]> {
    return Array.from(this.stagedCommits.values()).map(commit => ({
      id: commit.id,
      message: commit.message,
      files: commit.files,
      createdAt: commit.createdAt,
    }));
  }

  async discardStagedCommit(id: string): Promise<void> {
    if (!this.stagedCommits.has(id)) {
      throw new GitError(`Staged commit not found: ${id}`);
    }
    this.stagedCommits.delete(id);
  }

  // ============================================================================
  // Push Operations
  // ============================================================================

  async push(input: PushInput): Promise<PushResult> {
    const commit = this.stagedCommits.get(input.commitId);
    if (!commit) {
      throw new GitError(`Staged commit not found: ${input.commitId}`);
    }

    try {
      // Write files to working directory
      for (const file of commit.files) {
        const content = commit.contents.get(file.sandboxPath);
        if (!content) continue;

        const filePath = `${this.dir}${file.sandboxPath}`;
        await this.fs.promises.writeFile(filePath, content);

        // Stage the file
        await git.add({
          fs: this.fs,
          dir: this.dir,
          filepath: file.sandboxPath.replace(/^\//, ''),
        });
      }

      // Create commit
      const sha = await git.commit({
        fs: this.fs,
        dir: this.dir,
        message: commit.message,
        author: {
          name: this.authorName,
          email: this.authorEmail,
        },
      });

      // Push to remote
      const url = this.targetToUrl(input.target);
      const branch = input.target.type !== 'local-bare' ? input.target.branch : undefined;

      await git.push({
        fs: this.fs,
        http,
        dir: this.dir,
        url,
        ref: branch,
        onAuth: () => this.getAuth(),
      });

      // Remove from staged commits after successful push
      this.stagedCommits.delete(input.commitId);

      return {
        status: 'success',
        commitSha: sha,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Check for common push errors
      if (message.includes('non-fast-forward') || message.includes('rejected')) {
        return {
          status: 'conflict',
          conflict: {
            reason: 'non-fast-forward',
            message: 'Push rejected: remote has changes. Pull first.',
          },
        };
      }

      if (message.includes('401') || message.includes('403') || message.includes('auth')) {
        throw new GitAuthError(`Authentication failed: ${message}`);
      }

      throw new GitError(`Push failed: ${message}`);
    }
  }

  // ============================================================================
  // Pull Operations
  // ============================================================================

  async pull(input: PullInput): Promise<Array<{ path: string; content: BinaryData }>> {
    const url = this.targetToUrl(input.source);
    const branch = input.source.type !== 'local-bare' ? input.source.branch : undefined;

    try {
      // Fetch from remote
      await git.fetch({
        fs: this.fs,
        http,
        dir: this.dir,
        url,
        ref: branch,
        singleBranch: true,
        onAuth: () => this.getAuth(),
      });

      // Read requested files from the fetched ref
      const results: Array<{ path: string; content: BinaryData }> = [];
      const ref = branch ? `refs/remotes/origin/${branch}` : 'FETCH_HEAD';

      for (const path of input.paths) {
        try {
          const { blob } = await git.readBlob({
            fs: this.fs,
            dir: this.dir,
            oid: ref,
            filepath: path.replace(/^\//, ''),
          });
          results.push({ path, content: blob });
        } catch {
          // File not found in remote, skip
          console.warn(`File not found in remote: ${path}`);
        }
      }

      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('401') || message.includes('403') || message.includes('auth')) {
        throw new GitAuthError(`Authentication failed: ${message}`);
      }

      throw new GitError(`Pull failed: ${message}`);
    }
  }

  // ============================================================================
  // Diff/Status Operations
  // ============================================================================

  async diffStagedCommit(id: string): Promise<string> {
    const commit = this.stagedCommits.get(id);
    if (!commit) {
      throw new GitError(`Staged commit not found: ${id}`);
    }

    const diffs: string[] = [];
    const decoder = new TextDecoder();

    for (const file of commit.files) {
      const newContent = commit.contents.get(file.sandboxPath);
      if (!newContent) continue;

      // Try to read original content from git
      let oldContent = '';
      try {
        const { blob } = await git.readBlob({
          fs: this.fs,
          dir: this.dir,
          oid: 'HEAD',
          filepath: file.sandboxPath.replace(/^\//, ''),
        });
        oldContent = decoder.decode(blob);
      } catch {
        // File is new
      }

      const newContentStr = decoder.decode(newContent);
      const diff = generateDiff(oldContent, newContentStr, file.sandboxPath, file.sandboxPath);
      diffs.push(diff);
    }

    return diffs.join('\n');
  }

  async diffSummaryStagedCommit(id: string): Promise<DiffSummary[]> {
    const commit = this.stagedCommits.get(id);
    if (!commit) {
      throw new GitError(`Staged commit not found: ${id}`);
    }

    const summaries: DiffSummary[] = [];
    const decoder = new TextDecoder();

    for (const file of commit.files) {
      const newContent = commit.contents.get(file.sandboxPath);
      if (!newContent) continue;

      // Try to read original content from git
      let oldContent = '';
      let isNew = false;
      try {
        const { blob } = await git.readBlob({
          fs: this.fs,
          dir: this.dir,
          oid: 'HEAD',
          filepath: file.sandboxPath.replace(/^\//, ''),
        });
        oldContent = decoder.decode(blob);
      } catch {
        isNew = true;
      }

      const newContentStr = decoder.decode(newContent);
      const stats = computeDiffStats(oldContent, newContentStr);

      summaries.push({
        path: file.sandboxPath,
        additions: stats.additions,
        deletions: stats.deletions,
        isNew,
        isDeleted: file.operation === 'delete',
      });
    }

    return summaries;
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  async listBranches(target: GitTarget): Promise<BranchListResult> {
    try {
      // For local targets, list branches directly
      if (target.type === 'local' || target.type === 'local-bare') {
        const branches = await git.listBranches({
          fs: this.fs,
          dir: target.path,
        });

        // Get current branch
        let current: string | undefined;
        try {
          current = await git.currentBranch({
            fs: this.fs,
            dir: target.path,
          }) || undefined;
        } catch {
          // No current branch (detached HEAD or empty repo)
        }

        return { branches, current };
      }

      // For GitHub targets, list remote branches
      const url = this.targetToUrl(target);
      const remoteInfo = await git.getRemoteInfo({
        http,
        url,
        onAuth: () => this.getAuth(),
      });

      const branches = Object.keys(remoteInfo.refs?.heads || {});
      return {
        branches,
        current: remoteInfo.HEAD?.replace('refs/heads/', ''),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to list branches: ${message}`);
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async dispose(): Promise<void> {
    // Clear staged commits
    this.stagedCommits.clear();
  }
}

/**
 * Create an IsomorphicGitBackend for Node.js (CLI).
 *
 * Uses node:fs for file operations.
 */
export async function createNodeGitBackend(
  dir: string,
  options?: Partial<Omit<IsomorphicGitBackendOptions, 'fs' | 'dir'>>
): Promise<IsomorphicGitBackend> {
  // Dynamic import to avoid bundling node:fs in browser
  const fs = await import('node:fs');

  return new IsomorphicGitBackend({
    fs: fs as unknown as IsomorphicFs,
    dir,
    ...options,
  });
}
