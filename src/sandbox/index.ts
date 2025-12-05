/**
 * Sandbox Module
 *
 * Zone-based sandbox for secure file operations.
 */

// Types
export {
  Zone,
  TrustLevel,
  Operation,
  SourceContext,
  Session,
  ZoneConfig,
  ZonePermissions,
  SecurityContext,
  PermissionCheck,
  FileStat,
  StageRequest,
  StagedFile,
  StagedCommit,
  BackendConfig,
  BackendFileStat,
} from './types.js';

// Interfaces
export {
  Sandbox,
  SandboxBackend,
  AuditLog,
  AuditEntry,
  AuditFilter,
} from './interface.js';

// Errors
export {
  SandboxError,
  PermissionError,
  NotFoundError,
  InvalidPathError,
  FileExistsError,
  QuotaExceededError,
  isSandboxError,
} from './errors.js';

// Zones
export {
  PERMISSION_PROFILES,
  getPermissionProfile,
  trustLevelDominates,
  getZoneFromPath,
} from './zones.js';

// Implementation
export {
  SandboxImpl,
  createSecurityContext,
  createSession,
} from './impl.js';

// Backends
export { MemoryBackend, MemoryAuditLog } from './backends/memory.js';
