/**
 * UIProvider
 *
 * Combined provider that wraps all UI contexts.
 * Use this as a convenience to wrap your app with all necessary providers.
 *
 * @module @golem-forge/ui-react/providers/UIProvider
 */

import type { ReactNode } from 'react';
import type { UIEventBus } from '@golem-forge/core';
import { EventBusProvider } from '../contexts/EventBusContext.js';
import { MessagesProvider } from '../contexts/MessagesContext.js';
import { ApprovalProvider } from '../contexts/ApprovalContext.js';
import { WorkerProvider } from '../contexts/WorkerContext.js';
import { UIStateProvider } from '../contexts/UIStateContext.js';
import { ManualToolsProvider } from '../contexts/ManualToolsContext.js';
import type { ApprovalPattern } from '../state/approval-state.js';
import type { UIMode, UIFocus } from '../contexts/UIStateContext.js';

export interface UIProviderProps {
  children: ReactNode;
  bus: UIEventBus;
  /** Initial patterns for always-approved requests */
  initialAlwaysApprovals?: ApprovalPattern[];
  /** Initial UI mode */
  initialUIMode?: UIMode;
  /** Initial UI focus */
  initialUIFocus?: UIFocus;
}

/**
 * Combined provider that wraps all UI contexts.
 *
 * Order of nesting (outside to inside):
 * 1. EventBusProvider - Provides bus to all other providers
 * 2. UIStateProvider - UI-level state (mode, focus, errors)
 * 3. WorkerProvider - Worker tree state
 * 4. ApprovalProvider - Approval patterns and pending approvals
 * 5. ManualToolsProvider - Manual tool availability
 * 6. MessagesProvider - Message history and streaming
 *
 * @example
 * ```tsx
 * import { createUIEventBus } from '@golem-forge/core';
 * import { UIProvider } from '@golem-forge/ui-react';
 *
 * const bus = createUIEventBus();
 *
 * function App() {
 *   return (
 *     <UIProvider bus={bus}>
 *       <YourApp />
 *     </UIProvider>
 *   );
 * }
 * ```
 */
export function UIProvider({
  children,
  bus,
  initialAlwaysApprovals = [],
  initialUIMode = 'idle',
  initialUIFocus = 'input',
}: UIProviderProps) {
  return (
    <EventBusProvider bus={bus}>
      <UIStateProvider initialMode={initialUIMode} initialFocus={initialUIFocus}>
        <WorkerProvider>
          <ApprovalProvider initialAlwaysApprovals={initialAlwaysApprovals}>
            <ManualToolsProvider>
              <MessagesProvider>
                {children}
              </MessagesProvider>
            </ManualToolsProvider>
          </ApprovalProvider>
        </WorkerProvider>
      </UIStateProvider>
    </EventBusProvider>
  );
}
