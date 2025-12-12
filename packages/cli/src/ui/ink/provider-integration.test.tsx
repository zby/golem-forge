/**
 * Provider integration tests (Ink-mounted)
 *
 * These tests mount @golem-forge/ui-react providers inside Ink's renderer to
 * validate subscription stability and state updates in response to bus events.
 */

import { useEffect } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { createUIEventBus, type UIEventBus } from "@golem-forge/core";
import {
  UIProvider,
  useApprovalActions,
  usePendingApproval,
} from "@golem-forge/ui-react";

describe("ui-react provider integration (Ink)", () => {
  let bus: UIEventBus;
  let activeSubscriptions: Map<string, number>;

  function createInstrumentedBus(): UIEventBus {
    const raw = createUIEventBus();
    activeSubscriptions = new Map();
    return {
      ...raw,
      on(event: any, handler: any) {
        activeSubscriptions.set(event, (activeSubscriptions.get(event) ?? 0) + 1);
        const unsub = (raw as any).on(event, handler);
        return () => {
          activeSubscriptions.set(event, (activeSubscriptions.get(event) ?? 1) - 1);
          unsub();
        };
      },
    } as UIEventBus;
  }

  beforeEach(() => {
    bus = createInstrumentedBus();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("ApprovalProvider", () => {
    it("keeps a stable subscription across state changes", async () => {
      let actions: ReturnType<typeof useApprovalActions> | null = null;
      function ExposeActions(): null {
        const a = useApprovalActions();
        useEffect(() => {
          actions = a;
        }, [a]);
        return null;
      }

      render(
        <UIProvider bus={bus}>
          <ExposeActions />
        </UIProvider>
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(activeSubscriptions.get("approvalRequired")).toBe(1);

      bus.emit("approvalRequired", {
        requestId: "a1",
        type: "tool_call",
        description: "Test",
        details: {},
        risk: "low",
        workerPath: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      actions!.respond({ approved: true });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(activeSubscriptions.get("approvalRequired")).toBe(1);
    });

    it("keeps approval actions referentially stable", async () => {
      const seen: ReturnType<typeof useApprovalActions>[] = [];
      function RecordActions(): null {
        const actions = useApprovalActions();
        useEffect(() => {
          seen.push(actions);
        }, [actions]);
        return null;
      }

      function PendingProbe(): null {
        usePendingApproval();
        return null;
      }

      render(
        <UIProvider bus={bus}>
          <RecordActions />
          <PendingProbe />
        </UIProvider>
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(seen.length).toBeGreaterThan(0);
      const first = seen[0];

      bus.emit("approvalRequired", {
        requestId: "a1",
        type: "tool_call",
        description: "Test",
        details: {},
        risk: "low",
        workerPath: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(seen.every((a) => a === first)).toBe(true);
    });

    it("logs an error if a second approval arrives while pending", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      let latestPendingRequestId: string | null = null;
      function PendingObserver(): null {
        const pending = usePendingApproval();
        useEffect(() => {
          latestPendingRequestId = pending ? (pending as any).requestId : null;
        }, [pending]);
        return null;
      }

      render(
        <UIProvider bus={bus}>
          <PendingObserver />
        </UIProvider>
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(activeSubscriptions.get("approvalRequired")).toBe(1);

      bus.emit("approvalRequired", {
        requestId: "a1",
        type: "tool_call",
        description: "First",
        details: {},
        risk: "low",
        workerPath: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(latestPendingRequestId).toBe("a1");

      bus.emit("approvalRequired", {
        requestId: "a2",
        type: "tool_call",
        description: "Second",
        details: {},
        risk: "low",
        workerPath: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(latestPendingRequestId).toBe("a1");

      expect(consoleError).toHaveBeenCalled();
    });
  });
});
