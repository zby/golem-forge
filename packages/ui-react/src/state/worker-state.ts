/**
 * Worker State Management
 *
 * Platform-agnostic state management for worker tree hierarchy.
 * Workers can spawn sub-workers, forming a tree structure.
 * Pure functions that return new state objects for immutability.
 *
 * @module @golem-forge/ui-react/state/worker-state
 */

import type { WorkerStatus, WorkerInfo } from '@golem-forge/core';

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
  progress: TaskProgress
): WorkerNode {
  return {
    id: progress.id,
    task: progress.task,
    status: progress.status,
    parentId: progress.parentId,
    depth: progress.depth,
  };
}

// ============================================================================
// State Updates
// ============================================================================

function recomputeActiveWorkerId(workers: Map<string, WorkerNode>): string | null {
  let best: WorkerNode | null = null;
  for (const worker of workers.values()) {
    if (worker.status !== 'running') continue;
    if (!best) {
      best = worker;
      continue;
    }
    if (worker.depth > best.depth) {
      best = worker;
      continue;
    }
    if (worker.depth === best.depth && worker.id > best.id) {
      best = worker;
    }
  }
  return best?.id ?? null;
}

function recomputeRootWorkerId(
  workers: Map<string, WorkerNode>,
  currentRoot: string | null
): string | null {
  if (currentRoot && workers.has(currentRoot)) {
    return currentRoot;
  }

  const depthZero = Array.from(workers.values())
    .filter((w) => w.depth === 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (depthZero.length > 0) {
    return depthZero[0].id;
  }

  const orphanRoots = Array.from(workers.values())
    .filter((w) => !w.parentId || !workers.has(w.parentId))
    .sort((a, b) => (a.depth - b.depth) || a.id.localeCompare(b.id));
  return orphanRoots[0]?.id ?? null;
}

function buildChildrenMap(workers: Map<string, WorkerNode>): Map<string, string[]> {
  const childrenByParentId = new Map<string, string[]>();
  for (const worker of workers.values()) {
    if (!worker.parentId) continue;
    const parentId = worker.parentId;
    const existing = childrenByParentId.get(parentId);
    if (existing) {
      existing.push(worker.id);
    } else {
      childrenByParentId.set(parentId, [worker.id]);
    }
  }
  for (const [parentId, childIds] of childrenByParentId.entries()) {
    childIds.sort((a, b) => a.localeCompare(b));
    childrenByParentId.set(parentId, childIds);
  }
  return childrenByParentId;
}

/**
 * Add a worker to the tree.
 */
export function addWorker(state: WorkerState, worker: WorkerNode): WorkerState {
  const newWorkers = new Map(state.workers);
  newWorkers.set(worker.id, worker);

  // Set root if this is depth 0
  const newRootWorkerId = worker.depth === 0 ? worker.id : state.rootWorkerId;

  return {
    workers: newWorkers,
    activeWorkerId: recomputeActiveWorkerId(newWorkers),
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
    activeWorkerId: recomputeActiveWorkerId(newWorkers),
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
  const childrenByParentId = buildChildrenMap(newWorkers);

  function removeRecursive(workerId: string): void {
    const childIds = childrenByParentId.get(workerId) ?? [];
    for (const childId of childIds) {
      removeRecursive(childId);
    }
    newWorkers.delete(workerId);
  }

  removeRecursive(id);

  const newActiveWorkerId = recomputeActiveWorkerId(newWorkers);
  const newRootWorkerId = recomputeRootWorkerId(newWorkers, state.rootWorkerId === id ? null : state.rootWorkerId);

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
      depth: progress.depth,
      parentId: progress.parentId,
    });

    return {
      ...state,
      workers: newWorkers,
      activeWorkerId: recomputeActiveWorkerId(newWorkers),
      rootWorkerId:
        progress.depth === 0 ? progress.id : recomputeRootWorkerId(newWorkers, state.rootWorkerId),
    };
  } else {
    // Create new worker
    const worker = workerFromProgress(progress);
    let newState = addWorker(state, worker);

    newState = {
      ...newState,
      rootWorkerId:
        progress.depth === 0 ? progress.id : recomputeRootWorkerId(newState.workers, newState.rootWorkerId),
    };
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
  const childrenByParentId = buildChildrenMap(state.workers);
  const visited = new Set<string>();

  function visit(workerId: string): void {
    if (visited.has(workerId)) return;
    const worker = state.workers.get(workerId);
    if (!worker) {
      return;
    }

    result.push(worker);
    visited.add(workerId);

    const childIds = childrenByParentId.get(workerId) ?? [];
    for (const childId of childIds) {
      visit(childId);
    }
  }

  // Start from configured root if available
  if (state.rootWorkerId && state.workers.has(state.rootWorkerId)) {
    visit(state.rootWorkerId);
  } else {
    // Otherwise start from inferred roots
    const roots = Array.from(state.workers.values())
      .filter((w) => w.depth === 0 || !w.parentId || !state.workers.has(w.parentId))
      .sort((a, b) => (a.depth - b.depth) || a.id.localeCompare(b.id));
    for (const root of roots) {
      visit(root.id);
    }
  }

  // Add any unvisited workers (defensive)
  const remaining = Array.from(state.workers.values())
    .filter((w) => !visited.has(w.id))
    .sort((a, b) => (a.depth - b.depth) || a.id.localeCompare(b.id));
  for (const worker of remaining) {
    visit(worker.id);
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
  const children: WorkerNode[] = [];
  for (const worker of state.workers.values()) {
    if (worker.parentId === workerId) {
      children.push(worker);
    }
  }
  children.sort((a, b) => a.id.localeCompare(b.id));
  return children;
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
