/**
 * Sandbox Module
 *
 * Simple filesystem abstraction with zone-based organization.
 */

// Types
export {
  Zone,
  Operation,
  FileStat,
  BackendFileStat,
  SandboxConfig,
  BackendConfig,
} from './types.js';

// Interfaces
export { Sandbox, SandboxBackend } from './interface.js';

// Errors
export {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  isSandboxError,
} from './errors.js';

// Zones
export { getZoneFromPath, isValidZonePath } from './zones.js';

// Implementation
export { SandboxImpl, createSandbox, createTestSandbox } from './impl.js';

// Backends
export { MemoryBackend } from './backends/memory.js';
export { CLIBackend } from './backends/cli.js';
