/**
 * Tests for Worker State Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createWorkerState,
  workerFromProgress,
  addWorker,
  updateWorkerStatus,
  removeWorker,
  updateFromProgress,
  clearWorkers,
  getWorkerPath,
  getActiveWorker,
  getWorkerList,
  getWorkersInTreeOrder,
  getWorkersAtDepth,
  getWorkerChildren,
  getWorkerStats,
} from './worker-state.js';
import type { WorkerState, WorkerNode, TaskProgress } from './worker-state.js';

describe('Worker State', () => {
  let state: WorkerState;

  beforeEach(() => {
    state = createWorkerState();
  });

  describe('createWorkerState', () => {
    it('should create empty state', () => {
      expect(state.workers.size).toBe(0);
      expect(state.activeWorkerId).toBeNull();
      expect(state.rootWorkerId).toBeNull();
    });
  });

  describe('workerFromProgress', () => {
    it('should create worker node from progress', () => {
      const progress: TaskProgress = {
        id: 'worker-1',
        task: 'Test task',
        status: 'running',
        depth: 0,
        parentId: undefined,
      };

      const worker = workerFromProgress(progress);

      expect(worker.id).toBe('worker-1');
      expect(worker.task).toBe('Test task');
      expect(worker.status).toBe('running');
      expect(worker.depth).toBe(0);
      expect(worker.parentId).toBeUndefined();
    });
  });

  describe('addWorker', () => {
    it('should add worker to state', () => {
      const worker: WorkerNode = {
        id: 'w1',
        task: 'Task 1',
        status: 'pending',
        depth: 0,
      };

      state = addWorker(state, worker);

      expect(state.workers.size).toBe(1);
      expect(state.workers.get('w1')).toEqual(worker);
    });

    it('should set root for depth 0 workers', () => {
      const worker: WorkerNode = {
        id: 'root',
        task: 'Root task',
        status: 'running',
        depth: 0,
      };

      state = addWorker(state, worker);

      expect(state.rootWorkerId).toBe('root');
    });

    it('should not change root for nested workers', () => {
      // Add root first
      state = addWorker(state, {
        id: 'root',
        task: 'Root',
        status: 'running',
        depth: 0,
      });

      // Add nested worker
      state = addWorker(state, {
        id: 'child',
        task: 'Child',
        status: 'pending',
        parentId: 'root',
        depth: 1,
      });

      expect(state.rootWorkerId).toBe('root');
    });

    it('should handle out-of-order parent/child insertion', () => {
      // Add child before parent exists
      state = addWorker(state, {
        id: 'child',
        task: 'Child',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });

      // Add parent later
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent',
        status: 'running',
        depth: 0,
      });

      const children = getWorkerChildren(state, 'parent');
      expect(children.map((c) => c.id)).toEqual(['child']);

      const ordered = getWorkersInTreeOrder(state);
      expect(ordered.map((w) => w.id)).toEqual(['parent', 'child']);
    });
  });

  describe('updateWorkerStatus', () => {
    it('should update worker status', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Task',
        status: 'pending',
        depth: 0,
      });

      state = updateWorkerStatus(state, 'w1', 'running');

      expect(state.workers.get('w1')?.status).toBe('running');
    });

    it('should not modify state for unknown worker', () => {
      const originalState = state;
      state = updateWorkerStatus(state, 'unknown', 'running');
      expect(state).toBe(originalState);
    });
  });

  describe('removeWorker', () => {
    it('should remove worker', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Task',
        status: 'complete',
        depth: 0,
      });

      state = removeWorker(state, 'w1');

      expect(state.workers.size).toBe(0);
    });

    it('should remove children recursively', () => {
      // Build tree: parent -> child1, child2 -> grandchild
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'child1',
        task: 'Child 1',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'child2',
        task: 'Child 2',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'grandchild',
        task: 'Grandchild',
        status: 'running',
        parentId: 'child1',
        depth: 2,
      });

      state = removeWorker(state, 'parent');

      expect(state.workers.size).toBe(0);
    });

    it('should not strand descendants when inserted out of order', () => {
      // Add child and grandchild before parent exists
      state = addWorker(state, {
        id: 'grandchild',
        task: 'Grandchild',
        status: 'running',
        parentId: 'child',
        depth: 2,
      });
      state = addWorker(state, {
        id: 'child',
        task: 'Child',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent',
        status: 'running',
        depth: 0,
      });

      state = removeWorker(state, 'parent');

      expect(state.workers.size).toBe(0);
    });

    it('should update active worker if removed', () => {
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'child',
        task: 'Child',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });

      state = removeWorker(state, 'child');

      expect(state.activeWorkerId).toBe('parent');
    });
  });

  describe('updateFromProgress', () => {
    it('should create new worker from progress', () => {
      const progress: TaskProgress = {
        id: 'w1',
        task: 'New task',
        status: 'running',
        depth: 0,
      };

      state = updateFromProgress(state, progress);

      expect(state.workers.size).toBe(1);
      expect(state.workers.get('w1')?.task).toBe('New task');
      expect(state.activeWorkerId).toBe('w1');
    });

    it('should update existing worker', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Old task',
        status: 'pending',
        depth: 0,
      });

      state = updateFromProgress(state, {
        id: 'w1',
        task: 'Updated task',
        status: 'running',
        depth: 0,
      });

      expect(state.workers.size).toBe(1);
      expect(state.workers.get('w1')?.task).toBe('Updated task');
      expect(state.workers.get('w1')?.status).toBe('running');
    });

    it('should transition active worker on completion', () => {
      state = updateFromProgress(state, {
        id: 'parent',
        task: 'Parent task',
        status: 'running',
        depth: 0,
      });
      state = updateFromProgress(state, {
        id: 'child',
        task: 'Child task',
        status: 'running',
        depth: 1,
        parentId: 'parent',
      });

      expect(state.activeWorkerId).toBe('child');

      // Child completes, parent still running, so active moves back to parent
      state = updateFromProgress(state, {
        id: 'child',
        task: 'Child task',
        status: 'complete',
        depth: 1,
        parentId: 'parent',
      });

      expect(state.activeWorkerId).toBe('parent');
    });
  });

  describe('clearWorkers', () => {
    it('should reset state', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Task',
        status: 'running',
        depth: 0,
      });

      state = clearWorkers();

      expect(state.workers.size).toBe(0);
      expect(state.activeWorkerId).toBeNull();
      expect(state.rootWorkerId).toBeNull();
    });
  });

  describe('getWorkerPath', () => {
    beforeEach(() => {
      // Build tree: root -> parent -> child
      state = addWorker(state, {
        id: 'root',
        task: 'Root task',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent task',
        status: 'running',
        parentId: 'root',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'child',
        task: 'Child task',
        status: 'running',
        parentId: 'parent',
        depth: 2,
      });
    });

    it('should return path from root to active worker', () => {
      const path = getWorkerPath(state);

      expect(path).toHaveLength(3);
      expect(path[0].id).toBe('root');
      expect(path[1].id).toBe('parent');
      expect(path[2].id).toBe('child');
    });

    it('should return path to specified worker', () => {
      const path = getWorkerPath(state, 'parent');

      expect(path).toHaveLength(2);
      expect(path[0].id).toBe('root');
      expect(path[1].id).toBe('parent');
    });

    it('should return empty array when no active worker', () => {
      state = updateFromProgress(state, {
        id: 'child',
        task: 'Child task',
        status: 'complete',
        depth: 2,
        parentId: 'parent',
      });
      state = updateFromProgress(state, {
        id: 'parent',
        task: 'Parent task',
        status: 'complete',
        depth: 1,
        parentId: 'root',
      });
      state = updateFromProgress(state, {
        id: 'root',
        task: 'Root task',
        status: 'complete',
        depth: 0,
      });
      const path = getWorkerPath(state);
      expect(path).toEqual([]);
    });
  });

  describe('getActiveWorker', () => {
    it('should return active worker', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Task',
        status: 'running',
        depth: 0,
      });

      const active = getActiveWorker(state);

      expect(active?.id).toBe('w1');
    });

    it('should return null when no active worker', () => {
      expect(getActiveWorker(state)).toBeNull();
    });
  });

  describe('getWorkerList', () => {
    it('should return all workers', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Task 1',
        status: 'complete',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'w2',
        task: 'Task 2',
        status: 'running',
        depth: 0,
      });

      const list = getWorkerList(state);

      expect(list).toHaveLength(2);
    });
  });

  describe('getWorkersInTreeOrder', () => {
    it('should return workers in depth-first order', () => {
      // Build tree:
      // root
      //   ├── child1
      //   │   └── grandchild
      //   └── child2
      state = addWorker(state, {
        id: 'root',
        task: 'Root',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'child1',
        task: 'Child 1',
        status: 'running',
        parentId: 'root',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'grandchild',
        task: 'Grandchild',
        status: 'running',
        parentId: 'child1',
        depth: 2,
      });
      state = addWorker(state, {
        id: 'child2',
        task: 'Child 2',
        status: 'running',
        parentId: 'root',
        depth: 1,
      });

      const ordered = getWorkersInTreeOrder(state);

      expect(ordered.map((w) => w.id)).toEqual([
        'root',
        'child1',
        'grandchild',
        'child2',
      ]);
    });
  });

  describe('getWorkersAtDepth', () => {
    it('should return workers at specific depth', () => {
      state = addWorker(state, {
        id: 'root',
        task: 'Root',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'child1',
        task: 'Child 1',
        status: 'running',
        parentId: 'root',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'child2',
        task: 'Child 2',
        status: 'running',
        parentId: 'root',
        depth: 1,
      });

      const atDepth1 = getWorkersAtDepth(state, 1);

      expect(atDepth1).toHaveLength(2);
      expect(atDepth1.every((w) => w.depth === 1)).toBe(true);
    });
  });

  describe('getWorkerChildren', () => {
    it('should return children of worker', () => {
      state = addWorker(state, {
        id: 'parent',
        task: 'Parent',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'child1',
        task: 'Child 1',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });
      state = addWorker(state, {
        id: 'child2',
        task: 'Child 2',
        status: 'running',
        parentId: 'parent',
        depth: 1,
      });

      const children = getWorkerChildren(state, 'parent');

      expect(children).toHaveLength(2);
    });

    it('should return empty array for unknown worker', () => {
      expect(getWorkerChildren(state, 'unknown')).toEqual([]);
    });
  });

  describe('getWorkerStats', () => {
    it('should return correct statistics', () => {
      state = addWorker(state, {
        id: 'w1',
        task: 'Pending',
        status: 'pending',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'w2',
        task: 'Running',
        status: 'running',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'w3',
        task: 'Complete',
        status: 'complete',
        depth: 0,
      });
      state = addWorker(state, {
        id: 'w4',
        task: 'Error',
        status: 'error',
        depth: 0,
      });

      const stats = getWorkerStats(state);

      expect(stats.total).toBe(4);
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(1);
      expect(stats.complete).toBe(1);
      expect(stats.error).toBe(1);
    });
  });

  describe('immutability', () => {
    it('should not mutate original state', () => {
      const original = createWorkerState();

      addWorker(original, {
        id: 'w1',
        task: 'Task',
        status: 'running',
        depth: 0,
      });

      expect(original.workers.size).toBe(0);
    });
  });
});
