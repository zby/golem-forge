/**
 * CLI Git Backend
 *
 * Implementation of GitBackend for CLI environment.
 * Uses isomorphic-git for pure JS git operations and native git CLI for some operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync } from 'child_process';
import { Octokit } from '@octokit/rest';

import type { GitBackend, CreateStagedCommitInput, PushInput, PullInput } from './backend.js';
import type {
  StagedCommit,
  StagedCommitData,
  StagedFile,
  GitTarget,
  GitHubTarget,
  LocalTarget,
  PushResult,
  BranchListResult,
} from './types.js';
import { GitError, GitAuthError } from './types.js';
import { getGitHubAuth } from './auth.js';
import { generateNewFilePatch, generateDeleteFilePatch, computeDiffStats } from './merge.js';
import type { DiffSummary } from '../../ui/types.js';

/**
 * Options for git command execution.
 */
interface ExecGitOptions {
  /** Working directory for the git command */
  cwd: string;
  /** Additional environment variables to pass to git */
  env?: Record<string, string>;
}

/**
 * Safely execute a git command with array arguments.
 * Prevents command injection by not using shell interpolation.
 *
 * Environment variables are inherited from process.env by default.
 * Additional env vars can be passed via options.env to override or extend.
 */
function execGit(args: string[], options: ExecGitOptions): string {
  const result = spawnSync('git', args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    // Inherit process.env, overlay with any explicit env vars
    env: options.env ? { ...process.env, ...options.env } : undefined,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim() || 'Unknown error';
    throw new Error(`git ${args[0]} failed: ${stderr}`);
  }

  return result.stdout;
}

/**
 * Generate a unique ID for staged commits.
 */
function generateCommitId(): string {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Calculate SHA-256 hash of content.
 */
function hashContent(content: Buffer): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Resolve a target path relative to program root.
 */
function resolveTargetPath(targetPath: string, programRoot?: string): string {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }
  if (programRoot) {
    return path.resolve(programRoot, targetPath);
  }
  return path.resolve(process.cwd(), targetPath);
}

/**
 * Options for creating a CLI git backend.
 */
export interface CLIGitBackendOptions {
  /** Program root directory for resolving relative paths */
  programRoot?: string;
  /**
   * Additional environment variables to pass to git commands.
   * These are merged with process.env (explicit vars take precedence).
   * Useful for:
   * - GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL (override committer identity)
   * - GIT_SSH_COMMAND (custom SSH configuration)
   * - GIT_TERMINAL_PROMPT=0 (disable prompts in automation)
   */
  env?: Record<string, string>;
}

/**
 * CLI implementation of GitBackend.
 *
 * Stores staged commits in memory with file contents.
 * Pushes to local repos via git CLI or isomorphic-git.
 * Pushes to GitHub via Octokit API.
 *
 * Credential inheritance:
 * - SSH keys: Inherited from SSH agent ($SSH_AUTH_SOCK)
 * - Credential helpers: Inherited from git config (credential.helper)
 * - GitHub tokens: Via GITHUB_TOKEN env var or `gh auth token`
 */
export class CLIGitBackend implements GitBackend {
  private stagedCommits: Map<string, StagedCommitData> = new Map();
  private programRoot?: string;
  private env?: Record<string, string>;

  constructor(options: CLIGitBackendOptions = {}) {
    this.programRoot = options.programRoot;
    this.env = options.env;
  }

  /**
   * Execute a git command with inherited environment.
   */
  private execGit(args: string[], cwd: string): string {
    return execGit(args, { cwd, env: this.env });
  }

  // ============================================================================
  // Staging Operations
  // ============================================================================

  async createStagedCommit(input: CreateStagedCommitInput): Promise<StagedCommit> {
    const id = generateCommitId();
    const now = new Date();

    const files: StagedFile[] = [];
    const contents = new Map<string, Buffer>();

    for (const file of input.files) {
      const contentHash = hashContent(file.content);
      files.push({
        sandboxPath: file.sandboxPath,
        operation: 'create', // TODO: Detect update/delete based on target state
        contentHash,
        size: file.content.length,
      });
      contents.set(file.sandboxPath, file.content);
    }

    const staged: StagedCommitData = {
      id,
      message: input.message,
      files,
      createdAt: now,
      contents,
    };

    this.stagedCommits.set(id, staged);

    // Return without contents (public interface)
    return {
      id,
      message: input.message,
      files,
      createdAt: now,
    };
  }

  async getStagedCommit(id: string): Promise<StagedCommit | null> {
    const staged = this.stagedCommits.get(id);
    if (!staged) return null;

    // Return without contents
    return {
      id: staged.id,
      message: staged.message,
      files: staged.files,
      createdAt: staged.createdAt,
    };
  }

  async listStagedCommits(): Promise<StagedCommit[]> {
    return Array.from(this.stagedCommits.values()).map(staged => ({
      id: staged.id,
      message: staged.message,
      files: staged.files,
      createdAt: staged.createdAt,
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
    const staged = this.stagedCommits.get(input.commitId);
    if (!staged) {
      throw new GitError(`Staged commit not found: ${input.commitId}`);
    }

    switch (input.target.type) {
      case 'local':
        return this.pushToLocal(staged, input.target);
      case 'github':
        return this.pushToGitHub(staged, input.target);
      case 'local-bare':
        throw new GitError('Bare repository push not yet implemented');
      default:
        throw new GitError(`Unknown target type: ${(input.target as GitTarget).type}`);
    }
  }

  /**
   * Push to a local git repository using native git CLI.
   */
  private async pushToLocal(staged: StagedCommitData, target: LocalTarget): Promise<PushResult> {
    const repoPath = resolveTargetPath(target.path, this.programRoot);

    // Verify it's a git repository
    try {
      await fs.access(path.join(repoPath, '.git'));
    } catch {
      throw new GitError(`Not a git repository: ${repoPath}`);
    }

    // Write files to working tree
    for (const file of staged.files) {
      const content = staged.contents.get(file.sandboxPath);
      if (!content) continue;

      // Convert sandbox path to relative path (strip leading /)
      const relativePath = file.sandboxPath.replace(/^\//, '');
      const destPath = path.join(repoPath, relativePath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      await fs.writeFile(destPath, content);
    }

    // Stage files using array args to prevent command injection
    const relativePaths = staged.files.map(f => f.sandboxPath.replace(/^\//, ''));
    try {
      // Use '--' to separate paths from flags, preventing flag injection
      this.execGit(['add', '--', ...relativePaths], repoPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to stage files: ${message}`);
    }

    // Check if there's anything to commit
    try {
      const status = this.execGit(['status', '--porcelain'], repoPath);
      if (!status.trim()) {
        // Nothing to commit
        return {
          status: 'success',
          commitSha: 'no-changes',
        };
      }
    } catch (error) {
      // git status can fail if not a git repo - throw with context
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to check git status: ${message}`);
    }

    // Commit using array args to prevent command injection
    let commitSha: string;
    try {
      // Use '-m' with the message as a separate argument - safe from injection
      this.execGit(['commit', '-m', staged.message], repoPath);

      // Get the commit SHA
      commitSha = this.execGit(['rev-parse', 'HEAD'], repoPath).trim();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to commit: ${message}`);
    }

    // Verify we're on the target branch (if specified)
    // Note: We do NOT checkout branches automatically - that would be a surprising side effect
    if (target.branch) {
      try {
        const currentBranch = this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).trim();

        if (currentBranch !== target.branch) {
          throw new GitError(
            `Target branch "${target.branch}" does not match current branch "${currentBranch}". ` +
            `Please checkout the target branch first, or omit the branch to commit on the current branch.`
          );
        }
      } catch (error) {
        if (error instanceof GitError) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new GitError(`Failed to check branch: ${message}`);
      }
    }

    // Clean up staged commit after successful push
    this.stagedCommits.delete(staged.id);

    return {
      status: 'success',
      commitSha,
    };
  }

  /**
   * Push to GitHub using Octokit API.
   */
  private async pushToGitHub(staged: StagedCommitData, target: GitHubTarget): Promise<PushResult> {
    const auth = getGitHubAuth();
    const octokit = new Octokit({ auth: auth.password });

    const [owner, repo] = target.repo.split('/');
    if (!owner || !repo) {
      throw new GitError(`Invalid repository format: ${target.repo}. Expected "owner/repo".`);
    }

    try {
      // Get default branch if not specified
      let branch = target.branch;
      if (!branch) {
        const { data: repoData } = await octokit.repos.get({ owner, repo });
        branch = repoData.default_branch;
      }

      // Get the current commit SHA of the branch
      let baseCommitSha: string;
      let baseTreeSha: string;
      try {
        const { data: refData } = await octokit.git.getRef({
          owner,
          repo,
          ref: `heads/${branch}`,
        });
        baseCommitSha = refData.object.sha;

        const { data: commitData } = await octokit.git.getCommit({
          owner,
          repo,
          commit_sha: baseCommitSha,
        });
        baseTreeSha = commitData.tree.sha;
      } catch {
        // Branch doesn't exist - we'll create it
        const { data: repoData } = await octokit.repos.get({ owner, repo });
        const defaultBranch = repoData.default_branch;

        const { data: refData } = await octokit.git.getRef({
          owner,
          repo,
          ref: `heads/${defaultBranch}`,
        });
        baseCommitSha = refData.object.sha;

        const { data: commitData } = await octokit.git.getCommit({
          owner,
          repo,
          commit_sha: baseCommitSha,
        });
        baseTreeSha = commitData.tree.sha;
      }

      // Create blobs for each file
      const treeItems: Array<{
        path: string;
        mode: '100644';
        type: 'blob';
        sha: string;
      }> = [];

      for (const file of staged.files) {
        const content = staged.contents.get(file.sandboxPath);
        if (!content) continue;

        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: content.toString('base64'),
          encoding: 'base64',
        });

        // Convert sandbox path to relative path
        const relativePath = file.sandboxPath.replace(/^\//, '');

        treeItems.push({
          path: relativePath,
          mode: '100644',
          type: 'blob',
          sha: blob.sha,
        });
      }

      // Create tree
      const { data: tree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseTreeSha,
        tree: treeItems,
      });

      // Create commit
      const { data: commit } = await octokit.git.createCommit({
        owner,
        repo,
        message: staged.message,
        tree: tree.sha,
        parents: [baseCommitSha],
      });

      // Update or create branch reference
      try {
        await octokit.git.updateRef({
          owner,
          repo,
          ref: `heads/${branch}`,
          sha: commit.sha,
        });
      } catch {
        // Branch doesn't exist, create it
        await octokit.git.createRef({
          owner,
          repo,
          ref: `refs/heads/${branch}`,
          sha: commit.sha,
        });
      }

      // Clean up staged commit
      this.stagedCommits.delete(staged.id);

      return {
        status: 'success',
        commitSha: commit.sha,
      };
    } catch (error) {
      if (error instanceof GitAuthError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`GitHub push failed: ${message}`);
    }
  }

  // ============================================================================
  // Pull Operations
  // ============================================================================

  async pull(input: PullInput): Promise<Array<{ path: string; content: Buffer }>> {
    switch (input.source.type) {
      case 'local':
        return this.pullFromLocal(input.source, input.paths);
      case 'github':
        return this.pullFromGitHub(input.source, input.paths);
      case 'local-bare':
        throw new GitError('Bare repository pull not yet implemented');
      default:
        throw new GitError(`Unknown source type: ${(input.source as GitTarget).type}`);
    }
  }

  /**
   * Pull files from a local git repository.
   */
  private async pullFromLocal(
    source: LocalTarget,
    paths: string[]
  ): Promise<Array<{ path: string; content: Buffer }>> {
    const repoPath = resolveTargetPath(source.path, this.programRoot);
    const results: Array<{ path: string; content: Buffer }> = [];

    for (const filePath of paths) {
      const fullPath = path.join(repoPath, filePath);
      try {
        const content = await fs.readFile(fullPath);
        results.push({ path: filePath, content });
      } catch (error) {
        // Skip files that don't exist
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }

    return results;
  }

  /**
   * Pull files from GitHub using Octokit API.
   */
  private async pullFromGitHub(
    source: GitHubTarget,
    paths: string[]
  ): Promise<Array<{ path: string; content: Buffer }>> {
    const auth = getGitHubAuth();
    const octokit = new Octokit({ auth: auth.password });

    const [owner, repo] = source.repo.split('/');
    if (!owner || !repo) {
      throw new GitError(`Invalid repository format: ${source.repo}`);
    }

    const results: Array<{ path: string; content: Buffer }> = [];

    for (const filePath of paths) {
      try {
        const { data } = await octokit.repos.getContent({
          owner,
          repo,
          path: filePath,
          ref: source.branch,
        });

        if ('content' in data && data.type === 'file') {
          const content = Buffer.from(data.content, 'base64');
          results.push({ path: filePath, content });
        }
      } catch (error) {
        // Skip files that don't exist (404)
        const status = (error as { status?: number }).status;
        if (status !== 404) {
          throw error;
        }
      }
    }

    return results;
  }

  // ============================================================================
  // Diff Operations
  // ============================================================================

  async diffStagedCommit(id: string): Promise<string> {
    const staged = this.stagedCommits.get(id);
    if (!staged) {
      throw new GitError(`Staged commit not found: ${id}`);
    }

    const diffs: string[] = [];
    diffs.push(`Staged commit: ${id} "${staged.message}"\n`);

    for (const file of staged.files) {
      const content = staged.contents.get(file.sandboxPath);
      if (!content) continue;

      const contentStr = content.toString('utf8');

      switch (file.operation) {
        case 'create':
          diffs.push(generateNewFilePatch(contentStr, file.sandboxPath));
          break;
        case 'update':
          // For updates, we'd need the original content
          // For now, show as creation
          diffs.push(generateNewFilePatch(contentStr, file.sandboxPath));
          break;
        case 'delete':
          diffs.push(generateDeleteFilePatch(contentStr, file.sandboxPath));
          break;
      }
    }

    return diffs.join('\n');
  }

  async diffSummaryStagedCommit(id: string): Promise<DiffSummary[]> {
    const staged = this.stagedCommits.get(id);
    if (!staged) {
      throw new GitError(`Staged commit not found: ${id}`);
    }

    const summaries: DiffSummary[] = [];

    for (const file of staged.files) {
      const content = staged.contents.get(file.sandboxPath);
      const contentStr = content ? content.toString('utf8') : '';

      let additions: number;
      let deletions: number;

      switch (file.operation) {
        case 'create': {
          const stats = computeDiffStats('', contentStr);
          additions = stats.additions;
          deletions = stats.deletions;
          break;
        }
        case 'update':
          // For updates, we don't have original content to compute accurate stats.
          // Use -1 to indicate "unknown" - the UI should display appropriately.
          additions = -1;
          deletions = -1;
          break;
        case 'delete': {
          const stats = computeDiffStats(contentStr, '');
          additions = stats.additions;
          deletions = stats.deletions;
          break;
        }
      }

      summaries.push({
        path: file.sandboxPath,
        operation: file.operation,
        additions,
        deletions,
      });
    }

    return summaries;
  }

  // ============================================================================
  // Branch Operations
  // ============================================================================

  async listBranches(target: GitTarget): Promise<BranchListResult> {
    switch (target.type) {
      case 'local':
        return this.listLocalBranches(target);
      case 'github':
        return this.listGitHubBranches(target);
      case 'local-bare':
        throw new GitError('Bare repository branch listing not yet implemented');
      default:
        throw new GitError(`Unknown target type: ${(target as GitTarget).type}`);
    }
  }

  /**
   * List branches in a local repository.
   */
  private async listLocalBranches(target: LocalTarget): Promise<BranchListResult> {
    const repoPath = resolveTargetPath(target.path, this.programRoot);

    try {
      // Get all branches using safe array args
      const branchOutput = this.execGit(['branch', '--list'], repoPath);

      const branches = branchOutput
        .split('\n')
        .map(line => line.replace(/^\*?\s*/, '').trim())
        .filter(Boolean);

      // Get current branch using safe array args
      const current = this.execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath).trim();

      return { branches, current };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to list branches: ${message}`);
    }
  }

  /**
   * List branches in a GitHub repository.
   */
  private async listGitHubBranches(target: GitHubTarget): Promise<BranchListResult> {
    const auth = getGitHubAuth();
    const octokit = new Octokit({ auth: auth.password });

    const [owner, repo] = target.repo.split('/');
    if (!owner || !repo) {
      throw new GitError(`Invalid repository format: ${target.repo}`);
    }

    try {
      const { data: branches } = await octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100,
      });

      const { data: repoData } = await octokit.repos.get({ owner, repo });

      return {
        branches: branches.map(b => b.name),
        current: repoData.default_branch,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GitError(`Failed to list GitHub branches: ${message}`);
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async dispose(): Promise<void> {
    this.stagedCommits.clear();
  }
}

/**
 * Create a CLI git backend.
 */
export function createCLIGitBackend(options: CLIGitBackendOptions = {}): CLIGitBackend {
  return new CLIGitBackend(options);
}
