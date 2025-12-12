/**
 * Worker Context
 *
 * Provides worker tree state management with event bus integration.
 * Handles the hierarchy of workers, their statuses, and active worker tracking.
 *
 * @module @golem-forge/ui-react/contexts/WorkerContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { useEventBus } from './EventBusContext.js';
import {
  type WorkerState,
  type WorkerNode,
  createWorkerState,
  updateFromProgress,
  removeWorker,
  clearWorkers,
  getActiveWorker,
  getWorkerPath,
  getWorkersInTreeOrder,
} from '../state/worker-state.js';

interface WorkerContextValue {
  state: WorkerState;
  activeWorker: WorkerNode | null;
  workerPath: ReturnType<typeof getWorkerPath>;
  workersInOrder: WorkerNode[];
  actions: {
    remove: (id: string) => void;
    clear: () => void;
  };
}

const WorkerContext = createContext<WorkerContextValue | null>(null);
const WorkerActionsContext = createContext<WorkerContextValue['actions'] | null>(null);

export interface WorkerProviderProps {
  children: ReactNode;
}

/**
 * Provider that manages worker state and subscribes to bus events.
 */
export function WorkerProvider({ children }: WorkerProviderProps) {
  const bus = useEventBus();
  const [state, setState] = useState(createWorkerState);

  // Subscribe to worker update events
  useEffect(() => {
    const unsub = bus.on('workerUpdate', (event) => {
      setState((s) =>
        updateFromProgress(s, {
          id: event.workerId,
          task: event.task,
          status: event.status,
          depth: event.depth,
          parentId: event.parentId,
        })
      );
    });

    return unsub;
  }, [bus]);

  const remove = useCallback((id: string) => {
    setState((s) => removeWorker(s, id));
  }, []);

  const clear = useCallback(() => {
    setState(clearWorkers);
  }, []);

  // Compute derived values
  const activeWorker = getActiveWorker(state);
  const workerPath = getWorkerPath(state);
  const workersInOrder = getWorkersInTreeOrder(state);

  const actions = useMemo(
    () => ({
      remove,
      clear,
    }),
    [remove, clear]
  );

  const value: WorkerContextValue = {
    state,
    activeWorker,
    workerPath,
    workersInOrder,
    actions,
  };

  return (
    <WorkerActionsContext.Provider value={actions}>
      <WorkerContext.Provider value={value}>
        {children}
      </WorkerContext.Provider>
    </WorkerActionsContext.Provider>
  );
}

/**
 * Hook to access the full worker state.
 */
export function useWorkerState(): WorkerState {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useWorkerState must be used within WorkerProvider');
  }
  return ctx.state;
}

/**
 * Hook to access the currently active worker.
 */
export function useActiveWorker(): WorkerNode | null {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useActiveWorker must be used within WorkerProvider');
  }
  return ctx.activeWorker;
}

/**
 * Hook to access the worker path (root to active worker).
 */
export function useWorkerPath() {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useWorkerPath must be used within WorkerProvider');
  }
  return ctx.workerPath;
}

/**
 * Hook to access workers in tree order.
 */
export function useWorkersInOrder(): WorkerNode[] {
  const ctx = useContext(WorkerContext);
  if (!ctx) {
    throw new Error('useWorkersInOrder must be used within WorkerProvider');
  }
  return ctx.workersInOrder;
}

/**
 * Hook to access worker actions.
 */
export function useWorkerActions() {
  const actions = useContext(WorkerActionsContext);
  if (!actions) {
    throw new Error('useWorkerActions must be used within WorkerProvider');
  }
  return actions;
}
