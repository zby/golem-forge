/**
 * UI Event Bus
 *
 * Type-safe event bus for communication between runtime and UI.
 * This is the core abstraction that enables platform-agnostic UI implementations.
 *
 * @module @golem-forge/core/ui-event-bus
 */

import type {
  DisplayEvents,
  ActionEvents,
  AllEvents,
  Unsubscribe,
} from './ui-events.js';

/**
 * Type-safe event handler
 */
export type EventHandler<T> = (data: T) => void;

/**
 * Core event bus interface for UI communication.
 *
 * Display events flow from runtime to UI.
 * Action events flow from UI to runtime.
 *
 * @example
 * ```typescript
 * // Runtime emits display events
 * bus.emit('message', { message: { role: 'assistant', content: 'Hello' } });
 *
 * // UI subscribes to display events
 * bus.on('message', (data) => console.log(data.message.content));
 *
 * // UI emits action events
 * bus.emit('userInput', { requestId: 'req-1', content: 'Hi' });
 *
 * // Runtime subscribes to action events
 * bus.on('userInput', (data) => handleInput(data));
 * ```
 */
export interface UIEventBus {
  /**
   * Emit a display event (runtime -> UI)
   */
  emit<K extends keyof DisplayEvents>(event: K, data: DisplayEvents[K]): void;

  /**
   * Emit an action event (UI -> runtime)
   */
  emit<K extends keyof ActionEvents>(event: K, data: ActionEvents[K]): void;

  /**
   * Subscribe to a display event
   */
  on<K extends keyof DisplayEvents>(
    event: K,
    handler: EventHandler<DisplayEvents[K]>
  ): Unsubscribe;

  /**
   * Subscribe to an action event
   */
  on<K extends keyof ActionEvents>(
    event: K,
    handler: EventHandler<ActionEvents[K]>
  ): Unsubscribe;

  /**
   * Remove all handlers for an event
   */
  off<K extends keyof AllEvents>(event: K): void;

  /**
   * Remove all handlers for all events
   */
  clear(): void;
}

/**
 * Create a new UI event bus instance.
 *
 * The event bus is a simple pub/sub system that enables
 * decoupled communication between runtime and UI.
 *
 * @returns A new UIEventBus instance
 *
 * @example
 * ```typescript
 * const bus = createUIEventBus();
 *
 * // Subscribe before emitting
 * const unsubscribe = bus.on('message', (data) => {
 *   console.log('Received:', data.message.content);
 * });
 *
 * // Emit event
 * bus.emit('message', { message: { role: 'assistant', content: 'Hello' } });
 *
 * // Clean up
 * unsubscribe();
 * ```
 */
export function createUIEventBus(): UIEventBus {
  const handlers = new Map<string, Set<EventHandler<unknown>>>();

  function emit<K extends keyof AllEvents>(event: K, data: AllEvents[K]): void {
    const eventHandlers = handlers.get(event as string);
    if (eventHandlers) {
      for (const handler of eventHandlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for "${event as string}":`, error);
        }
      }
    }
  }

  function on<K extends keyof AllEvents>(
    event: K,
    handler: EventHandler<AllEvents[K]>
  ): Unsubscribe {
    const eventKey = event as string;
    if (!handlers.has(eventKey)) {
      handlers.set(eventKey, new Set());
    }
    const eventHandlers = handlers.get(eventKey)!;
    eventHandlers.add(handler as EventHandler<unknown>);

    return () => {
      eventHandlers.delete(handler as EventHandler<unknown>);
      if (eventHandlers.size === 0) {
        handlers.delete(eventKey);
      }
    };
  }

  function off<K extends keyof AllEvents>(event: K): void {
    handlers.delete(event as string);
  }

  function clear(): void {
    handlers.clear();
  }

  return {
    emit,
    on,
    off,
    clear,
  } as UIEventBus;
}
