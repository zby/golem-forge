/**
 * Worker State Management
 *
 * Platform-agnostic state management for worker tree hierarchy.
 * Workers can spawn sub-workers, forming a tree structure.
 * Pure functions that return new state objects for immutability.
 *
 * @module @golem-forge/core/worker-state
 */

import type { WorkerStatus, WorkerInfo } from './ui-events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * A node in the worker tree
 */
export interface WorkerNode {
  id: string;
  task: string;
  status: WorkerStatus;
  parentId?: string;
  children: string[];
  depth: number;
}

/**
 * Progress information for a task (used for updates from runtime)
 */
export interface TaskProgress {
  id: string;
  task: string;
  status: WorkerStatus;
  depth: number;
  parentId?: string;
}

/**
 * Worker tree state
 */
export interface WorkerState {
  /** Map of worker ID to worker node */
  workers: Map<string, WorkerNode>;
  /** Currently active worker ID */
  activeWorkerId: string | null;
  /** Root worker ID */
  rootWorkerId: string | null;
}

/**
 * Statistics about worker state
 */
export interface WorkerStats {
  total: number;
  pending: number;
  running: number;
  complete: number;
  error: number;
}

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create initial worker state.
 */
export function createWorkerState(): WorkerState {
  return {
    workers: new Map(),
    activeWorkerId: null,
    rootWorkerId: null,
  };
}

// ============================================================================
// Worker Node Creation
// ============================================================================

/**
 * Create a worker node from task progress.
 */
export function workerFromProgress(
  progress: TaskProgress,
  existingChildren: string[] = []
): WorkerNode {
  return {
    id: progress.id,
    task: progress.task,
    status: progress.status,
    parentId: progress.parentId,
    children: existingChildren,
    depth: progress.depth,
  };
}

// ============================================================================
// State Updates
// ============================================================================

/**
 * Add a worker to the tree.
 */
export function addWorker(state: WorkerState, worker: WorkerNode): WorkerState {
  const newWorkers = new Map(state.workers);
  newWorkers.set(worker.id, worker);

  // Update parent's children list
  if (worker.parentId && newWorkers.has(worker.parentId)) {
    const parent = newWorkers.get(worker.parentId)!;
    if (!parent.children.includes(worker.id)) {
      newWorkers.set(worker.parentId, {
        ...parent,
        children: [...parent.children, worker.id],
      });
    }
  }

  // Set root if this is depth 0
  const newRootWorkerId =
    worker.depth === 0 ? worker.id : state.rootWorkerId;

  return {
    workers: newWorkers,
    activeWorkerId: state.activeWorkerId,
    rootWorkerId: newRootWorkerId,
  };
}

/**
 * Update a worker's status.
 */
export function updateWorkerStatus(
  state: WorkerState,
  id: string,
  status: WorkerStatus
): WorkerState {
  const worker = state.workers.get(id);
  if (!worker) {
    return state;
  }

  const newWorkers = new Map(state.workers);
  newWorkers.set(id, { ...worker, status });

  return {
    ...state,
    workers: newWorkers,
  };
}

/**
 * Set the active worker.
 */
export function setActiveWorker(
  state: WorkerState,
  id: string | null
): WorkerState {
  return {
    ...state,
    activeWorkerId: id,
  };
}

/**
 * Remove a worker and its children from the tree.
 */
export function removeWorker(state: WorkerState, id: string): WorkerState {
  const worker = state.workers.get(id);
  if (!worker) {
    return state;
  }

  const newWorkers = new Map(state.workers);

  // Remove children recursively
  function removeRecursive(workerId: string): void {
    const w = newWorkers.get(workerId);
    if (w) {
      for (const childId of w.children) {
        removeRecursive(childId);
      }
      newWorkers.delete(workerId);
    }
  }

  removeRecursive(id);

  // Update parent's children list
  if (worker.parentId && newWorkers.has(worker.parentId)) {
    const parent = newWorkers.get(worker.parentId)!;
    newWorkers.set(worker.parentId, {
      ...parent,
      children: parent.children.filter((childId) => childId !== id),
    });
  }

  // Update active/root if needed
  let newActiveWorkerId = state.activeWorkerId;
  let newRootWorkerId = state.rootWorkerId;

  if (state.activeWorkerId === id) {
    newActiveWorkerId = worker.parentId || null;
  }
  if (state.rootWorkerId === id) {
    newRootWorkerId = null;
  }

  return {
    workers: newWorkers,
    activeWorkerId: newActiveWorkerId,
    rootWorkerId: newRootWorkerId,
  };
}

/**
 * Update state from task progress.
 * Idempotent - creates or updates the worker as needed.
 */
export function updateFromProgress(
  state: WorkerState,
  progress: TaskProgress
): WorkerState {
  const existing = state.workers.get(progress.id);

  if (existing) {
    // Update existing worker
    const newWorkers = new Map(state.workers);
    newWorkers.set(progress.id, {
      ...existing,
      task: progress.task,
      status: progress.status,
    });

    // Set as active if running
    const newActiveWorkerId =
      progress.status === 'running' ? progress.id : state.activeWorkerId;

    return {
      ...state,
      workers: newWorkers,
      activeWorkerId: newActiveWorkerId,
    };
  } else {
    // Create new worker
    const worker = workerFromProgress(progress);
    let newState = addWorker(state, worker);

    // Set as active if running
    if (progress.status === 'running') {
      newState = setActiveWorker(newState, progress.id);
    }

    return newState;
  }
}

/**
 * Clear all workers and reset state.
 */
export function clearWorkers(): WorkerState {
  return createWorkerState();
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get the path from root to a worker.
 * Returns array of WorkerInfo from root to the specified worker.
 */
export function getWorkerPath(
  state: WorkerState,
  workerId?: string
): WorkerInfo[] {
  const targetId = workerId ?? state.activeWorkerId;
  if (!targetId) {
    return [];
  }

  const path: WorkerInfo[] = [];
  let currentId: string | undefined = targetId;

  // Walk up the tree
  while (currentId) {
    const worker = state.workers.get(currentId);
    if (!worker) {
      break;
    }

    path.unshift({
      id: worker.id,
      depth: worker.depth,
      task: worker.task,
    });

    currentId = worker.parentId;
  }

  return path;
}

/**
 * Get the active worker node.
 */
export function getActiveWorker(state: WorkerState): WorkerNode | null {
  if (!state.activeWorkerId) {
    return null;
  }
  return state.workers.get(state.activeWorkerId) || null;
}

/**
 * Get all workers as a flat list.
 */
export function getWorkerList(state: WorkerState): WorkerNode[] {
  return Array.from(state.workers.values());
}

/**
 * Get workers in tree traversal order (depth-first).
 */
export function getWorkersInTreeOrder(state: WorkerState): WorkerNode[] {
  const result: WorkerNode[] = [];

  function visit(workerId: string): void {
    const worker = state.workers.get(workerId);
    if (!worker) {
      return;
    }

    result.push(worker);

    for (const childId of worker.children) {
      visit(childId);
    }
  }

  // Start from root
  if (state.rootWorkerId) {
    visit(state.rootWorkerId);
  }

  // Add any orphaned workers (shouldn't happen but defensive)
  for (const worker of state.workers.values()) {
    if (!result.includes(worker)) {
      result.push(worker);
    }
  }

  return result;
}

/**
 * Get workers at a specific depth level.
 */
export function getWorkersAtDepth(
  state: WorkerState,
  depth: number
): WorkerNode[] {
  return Array.from(state.workers.values()).filter((w) => w.depth === depth);
}

/**
 * Get children of a worker.
 */
export function getWorkerChildren(
  state: WorkerState,
  workerId: string
): WorkerNode[] {
  const worker = state.workers.get(workerId);
  if (!worker) {
    return [];
  }

  return worker.children
    .map((id) => state.workers.get(id))
    .filter((w): w is WorkerNode => w !== undefined);
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics about workers.
 */
export function getWorkerStats(state: WorkerState): WorkerStats {
  let pending = 0;
  let running = 0;
  let complete = 0;
  let error = 0;

  for (const worker of state.workers.values()) {
    switch (worker.status) {
      case 'pending':
        pending++;
        break;
      case 'running':
        running++;
        break;
      case 'complete':
        complete++;
        break;
      case 'error':
        error++;
        break;
    }
  }

  return {
    total: state.workers.size,
    pending,
    running,
    complete,
    error,
  };
}
