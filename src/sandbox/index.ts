/**
 * Sandbox Module
 *
 * Simple filesystem abstraction with zone-based organization.
 */

// Types
export { Zone } from './types.js';
export type {
  Operation,
  FileStat,
  BackendFileStat,
  SandboxConfig,
  BackendConfig,
  ZoneAccessMode,
  ZoneConfig,
  ZoneApprovalConfig,
  ApprovalDecisionType,
} from './types.js';

// Interfaces
export type { Sandbox, SandboxBackend } from './interface.js';

// Errors
export {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  isSandboxError,
} from './errors.js';

// Zones
export {
  getZoneFromPath,
  getZoneNameFromPath,
  getAllValidZones,
  isValidZonePath,
  registerCustomZones,
  clearCustomZones,
} from './zones.js';

// Implementation
export {
  SandboxImpl,
  RestrictedSandbox,
  createSandbox,
  createTestSandbox,
  createRestrictedSandbox,
} from './impl.js';

// Backends
export { MemoryBackend } from './backends/memory.js';
export { CLIBackend } from './backends/cli.js';
