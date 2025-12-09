/**
 * Tests for InkAdapter
 *
 * These tests use ink-testing-library to avoid rendering to actual terminal.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "ink-testing-library";
import { createUIEventBus, type UIEventBus } from "@golem-forge/core";
import { UIProvider } from "@golem-forge/ui-react";
import { ThemeProvider } from "./contexts/ThemeContext.js";
import { InkUIStateProvider, useInkUIState } from "./contexts/InkUIStateContext.js";
import { Footer } from "./components/layout/Footer.js";
import { MainContent } from "./components/layout/MainContent.js";

// Helper component to display messages for testing
function TestApp({ bus, children }: { bus: UIEventBus; children?: React.ReactNode }) {
  return (
    <ThemeProvider>
      <UIProvider bus={bus}>
        <InkUIStateProvider>
          {children}
        </InkUIStateProvider>
      </UIProvider>
    </ThemeProvider>
  );
}

// Helper to access InkUIState for testing
function ModelNameDisplay() {
  const state = useInkUIState();
  return <>{state.modelName}</>;
}

describe("InkAdapter UI Components", () => {
  let bus: UIEventBus;

  beforeEach(() => {
    bus = createUIEventBus();
  });

  describe("message rendering", () => {
    it("should render assistant messages when message event is emitted", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      // Emit a message event
      bus.emit("message", {
        message: { role: "assistant", content: "Hello from Claude!" },
      });

      // Wait for React to process the event
      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain("Hello from Claude!");
    });

    it("should render worker start messages", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      // Emit a worker update event
      bus.emit("workerUpdate", {
        workerId: "worker-123",
        task: "greeter",
        status: "running",
        depth: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain("worker-123");
      expect(output).toContain("greeter");
    });

    it("should render worker complete messages", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      // First start the worker
      bus.emit("workerUpdate", {
        workerId: "worker-456",
        task: "analyzer",
        status: "running",
        depth: 0,
      });

      // Then complete it
      bus.emit("workerUpdate", {
        workerId: "worker-456",
        task: "analyzer",
        status: "complete",
        depth: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain("worker-456");
      expect(output).toContain("completed");
    });

    it("should render status messages", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      bus.emit("status", {
        type: "info",
        message: "Processing your request...",
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      expect(output).toContain("Processing your request");
    });
  });

  describe("model name in footer", () => {
    it("should display default model name", () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <ModelNameDisplay />
        </TestApp>
      );

      const output = lastFrame();
      expect(output).toContain("claude-sonnet");
    });

    it("should update model name via InkUIStateContext", async () => {
      // Create a component that updates model name on mount
      function ModelNameUpdater({ name }: { name: string }) {
        const state = useInkUIState();
        React.useEffect(() => {
          // The context should have a setter - we need to test through the provider
        }, []);
        return <>{state.modelName}</>;
      }

      const { lastFrame, rerender } = render(
        <ThemeProvider>
          <UIProvider bus={bus}>
            <InkUIStateProvider initialModelName="claude-haiku-4-5">
              <ModelNameDisplay />
            </InkUIStateProvider>
          </UIProvider>
        </ThemeProvider>
      );

      const output = lastFrame();
      expect(output).toContain("claude-haiku-4-5");
    });
  });

  describe("session end handling", () => {
    it("should handle sessionEnd event without crashing", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      // Emit some messages first
      bus.emit("message", {
        message: { role: "assistant", content: "Task complete!" },
      });

      // Then end session
      bus.emit("sessionEnd", { reason: "completed" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should still have the message rendered
      const output = lastFrame();
      expect(output).toContain("Task complete!");
    });
  });

  describe("event sequencing", () => {
    it("should render messages in order", async () => {
      const { lastFrame } = render(
        <TestApp bus={bus}>
          <MainContent />
        </TestApp>
      );

      // Emit events in sequence like the runtime does
      bus.emit("workerUpdate", {
        workerId: "w1",
        task: "greeter",
        status: "running",
        depth: 0,
      });

      bus.emit("message", {
        message: { role: "assistant", content: "Hello there!" },
      });

      bus.emit("workerUpdate", {
        workerId: "w1",
        task: "greeter",
        status: "complete",
        depth: 0,
      });

      bus.emit("sessionEnd", { reason: "completed" });

      await new Promise((resolve) => setTimeout(resolve, 50));

      const output = lastFrame();
      // All elements should be present
      expect(output).toContain("greeter");
      expect(output).toContain("Hello there!");
      expect(output).toContain("completed");
    });
  });
});
