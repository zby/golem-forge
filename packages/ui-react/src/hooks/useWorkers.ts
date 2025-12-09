/**
 * Worker Hooks
 *
 * Convenience hooks for accessing worker state and derived values.
 *
 * @module @golem-forge/ui-react/hooks/useWorkers
 */

import {
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
} from '../contexts/WorkerContext.js';
import {
  getWorkerList,
  getWorkersAtDepth,
  getWorkerChildren,
  getWorkerStats,
} from '../state/worker-state.js';
import type { WorkerNode } from '../state/worker-state.js';

// Re-export context hooks
export {
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
};

/**
 * Hook to get all workers as a flat list.
 */
export function useWorkerList(): WorkerNode[] {
  const state = useWorkerState();
  return getWorkerList(state);
}

/**
 * Hook to get workers at a specific depth.
 */
export function useWorkersAtDepth(depth: number): WorkerNode[] {
  const state = useWorkerState();
  return getWorkersAtDepth(state, depth);
}

/**
 * Hook to get children of a specific worker.
 */
export function useWorkerChildren(workerId: string): WorkerNode[] {
  const state = useWorkerState();
  return getWorkerChildren(state, workerId);
}

/**
 * Hook to get worker statistics.
 */
export function useWorkerStats() {
  const state = useWorkerState();
  return getWorkerStats(state);
}

/**
 * Hook to check if there are any active workers.
 */
export function useHasActiveWorker(): boolean {
  const active = useActiveWorker();
  return active !== null;
}

/**
 * Hook to get the root worker ID.
 */
export function useRootWorkerId(): string | null {
  const state = useWorkerState();
  return state.rootWorkerId;
}
