/**
 * Sandbox Implementation
 *
 * Core sandbox class that provides filesystem abstraction.
 */

import { Zone, ZoneAccessMode, FileStat, SandboxConfig } from './types.js';
import { Sandbox, SandboxBackend } from './interface.js';
import { InvalidPathError, SandboxError } from './errors.js';
import { getZoneFromPath, isValidZonePath, registerCustomZones } from './zones.js';

/**
 * Core sandbox implementation.
 */
export class SandboxImpl implements Sandbox {
  private backend: SandboxBackend;
  private zoneAccess: Map<string, ZoneAccessMode>;

  constructor(backend: SandboxBackend, zoneAccess?: Map<string, ZoneAccessMode>) {
    this.backend = backend;
    // Default zones with rw access if not specified
    this.zoneAccess = zoneAccess ?? new Map([
      ['cache', 'rw'],
      ['workspace', 'rw'],
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFile(realPath);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFileBinary(realPath);
  }

  async write(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.writeFile(realPath, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.writeFileBinary(realPath, content);
  }

  async delete(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.deleteFile(realPath);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.exists(realPath);
  }

  async list(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.listDir(realPath);
  }

  async stat(path: string): Promise<FileStat> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    const backendStat = await this.backend.stat(realPath);

    return {
      path: normalizedPath,
      ...backendStat,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  resolve(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    return this.backend.mapVirtualToReal(normalizedPath, zone);
  }

  getZone(path: string): Zone {
    const normalized = this.normalizePath(path);
    try {
      return getZoneFromPath(normalized);
    } catch {
      throw new InvalidPathError(`Cannot determine zone for path: ${path}`, path);
    }
  }

  isValidPath(path: string): boolean {
    try {
      const normalized = this.normalizePath(path);
      return isValidZonePath(normalized);
    } catch {
      return false;
    }
  }

  getZoneAccess(zoneName: string): ZoneAccessMode | undefined {
    return this.zoneAccess.get(zoneName);
  }

  getAvailableZones(): string[] {
    return Array.from(this.zoneAccess.keys());
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    const originalPath = path;

    // All paths must be absolute (start with /)
    if (!path.startsWith('/')) {
      throw new InvalidPathError(
        'Path must be absolute (start with /). Use /workspace/ or /cache/',
        originalPath
      );
    }

    // Resolve . and ..
    const segments = path.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (resolved.length === 0) {
          throw new InvalidPathError('Path escape attempt detected', originalPath);
        }
        resolved.pop();
      } else {
        resolved.push(segment);
      }
    }

    if (resolved.length === 0) {
      throw new InvalidPathError('Path resolves to empty (no zone)', originalPath);
    }

    return '/' + resolved.join('/');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Restricted Sandbox Wrapper
// ─────────────────────────────────────────────────────────────────────────

/**
 * A sandbox wrapper that restricts access to specific zones.
 *
 * Used to implement per-worker sandbox isolation. Each child worker
 * gets a RestrictedSandbox that only allows access to the zones
 * it declared in its .worker file.
 */
export class RestrictedSandbox implements Sandbox {
  private parent: Sandbox;
  private allowedZones: Map<string, ZoneAccessMode>;

  /**
   * Create a restricted sandbox.
   *
   * @param parent - The parent sandbox to wrap
   * @param allowedZones - Map of zone names to access modes
   */
  constructor(parent: Sandbox, allowedZones: Map<string, ZoneAccessMode>) {
    this.parent = parent;
    this.allowedZones = allowedZones;
  }

  private checkZoneAccess(path: string, operation: 'read' | 'write'): void {
    const zoneName = this.extractZoneName(path);
    const allowed = this.allowedZones.get(zoneName);

    if (!allowed) {
      throw new SandboxError(
        'ZONE_ACCESS_DENIED',
        `Zone '${zoneName}' is not available to this worker. ` +
        `Available zones: ${Array.from(this.allowedZones.keys()).join(', ') || 'none'}`,
        path
      );
    }

    if (operation === 'write' && allowed === 'ro') {
      throw new SandboxError(
        'READ_ONLY_ZONE',
        `Zone '${zoneName}' is read-only for this worker`,
        path
      );
    }
  }

  private extractZoneName(path: string): string {
    const normalized = path.startsWith('/') ? path.slice(1) : path;
    const zoneName = normalized.split('/')[0];
    return zoneName;
  }

  async read(path: string): Promise<string> {
    this.checkZoneAccess(path, 'read');
    return this.parent.read(path);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    this.checkZoneAccess(path, 'read');
    return this.parent.readBinary(path);
  }

  async write(path: string, content: string): Promise<void> {
    this.checkZoneAccess(path, 'write');
    return this.parent.write(path, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.checkZoneAccess(path, 'write');
    return this.parent.writeBinary(path, content);
  }

  async delete(path: string): Promise<void> {
    this.checkZoneAccess(path, 'write');
    return this.parent.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    this.checkZoneAccess(path, 'read');
    return this.parent.exists(path);
  }

  async list(path: string): Promise<string[]> {
    this.checkZoneAccess(path, 'read');
    return this.parent.list(path);
  }

  async stat(path: string): Promise<FileStat> {
    this.checkZoneAccess(path, 'read');
    return this.parent.stat(path);
  }

  resolve(path: string): string {
    this.checkZoneAccess(path, 'read');
    return this.parent.resolve(path);
  }

  getZone(path: string): Zone {
    this.checkZoneAccess(path, 'read');
    return this.parent.getZone(path);
  }

  isValidPath(path: string): boolean {
    try {
      const zoneName = this.extractZoneName(path);
      if (!this.allowedZones.has(zoneName)) {
        return false;
      }
      return this.parent.isValidPath(path);
    } catch {
      return false;
    }
  }

  getZoneAccess(zoneName: string): ZoneAccessMode | undefined {
    return this.allowedZones.get(zoneName);
  }

  getAvailableZones(): string[] {
    return Array.from(this.allowedZones.keys());
  }
}

/**
 * Create a restricted sandbox from a parent sandbox.
 *
 * This is the preferred way to create sandboxes for child workers.
 * The child only gets access to the zones it declared.
 *
 * @param parent - The parent sandbox
 * @param allowedZones - Map of zone names to access modes
 * @returns A new restricted sandbox
 */
export function createRestrictedSandbox(
  parent: Sandbox,
  allowedZones: Map<string, ZoneAccessMode>
): Sandbox {
  return new RestrictedSandbox(parent, allowedZones);
}

// ─────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a sandbox with the specified configuration.
 *
 * @example
 * // Direct mode - maps to real directories
 * const sandbox = await createSandbox({
 *   mode: 'direct',
 *   cache: './downloads',
 *   workspace: './reports',
 * });
 *
 * @example
 * // Sandboxed mode - all in .sandbox directory
 * const sandbox = await createSandbox({
 *   mode: 'sandboxed',
 *   root: 'sandbox',
 * });
 *
 * @example
 * // Custom zones
 * const sandbox = await createSandbox({
 *   mode: 'sandboxed',
 *   root: 'sandbox',
 *   zones: {
 *     data: { path: './data', mode: 'ro' },
 *     output: { path: './output', mode: 'rw' },
 *   },
 * });
 */
export async function createSandbox(config: SandboxConfig): Promise<Sandbox> {
  const { CLIBackend } = await import('./backends/cli.js');

  const backend = new CLIBackend();
  await backend.initialize({
    mode: config.mode,
    root: config.root,
    cache: config.cache,
    workspace: config.workspace,
    zones: config.zones,
  });

  // Build zone access map
  const zoneAccess = new Map<string, ZoneAccessMode>();

  if (config.zones) {
    // Use custom zones
    const customZoneNames: string[] = [];
    for (const [name, zoneDef] of Object.entries(config.zones)) {
      zoneAccess.set(name, zoneDef.mode);
      customZoneNames.push(name);
    }
    // Register custom zones for path validation
    registerCustomZones(customZoneNames);
  } else {
    // Default zones
    zoneAccess.set('cache', 'rw');
    zoneAccess.set('workspace', 'rw');
  }

  return new SandboxImpl(backend, zoneAccess);
}

/**
 * Create a test sandbox with in-memory backend.
 */
export async function createTestSandbox(): Promise<Sandbox> {
  const { MemoryBackend } = await import('./backends/memory.js');

  const backend = new MemoryBackend();
  await backend.initialize({
    mode: 'sandboxed',
  });

  return new SandboxImpl(backend);
}
