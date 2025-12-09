/**
 * EventBus Context
 *
 * Provides the UIEventBus to the React component tree.
 * This is the foundation for all other contexts to subscribe to events.
 *
 * @module @golem-forge/ui-react/contexts/EventBusContext
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { UIEventBus } from '@golem-forge/core';

const EventBusContext = createContext<UIEventBus | null>(null);

export interface EventBusProviderProps {
  children: ReactNode;
  bus: UIEventBus;
}

/**
 * Provider that makes the UIEventBus available to the component tree.
 */
export function EventBusProvider({ children, bus }: EventBusProviderProps) {
  return (
    <EventBusContext.Provider value={bus}>
      {children}
    </EventBusContext.Provider>
  );
}

/**
 * Hook to access the UIEventBus.
 * Must be used within an EventBusProvider.
 */
export function useEventBus(): UIEventBus {
  const bus = useContext(EventBusContext);
  if (!bus) {
    throw new Error('useEventBus must be used within an EventBusProvider');
  }
  return bus;
}

/**
 * Hook to optionally access the UIEventBus.
 * Returns null if not within an EventBusProvider.
 */
export function useOptionalEventBus(): UIEventBus | null {
  return useContext(EventBusContext);
}
