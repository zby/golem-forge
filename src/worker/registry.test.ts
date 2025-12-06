/**
 * Tests for Worker Registry
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { WorkerRegistry, createWorkerRegistry } from "./registry.js";

describe("WorkerRegistry", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for test workers
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "worker-registry-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a test worker file.
   */
  async function createWorkerFile(
    name: string,
    content: string,
    subdir?: string
  ): Promise<string> {
    const dir = subdir ? path.join(tempDir, subdir) : tempDir;
    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${name}.worker`);
    await fs.writeFile(filePath, content, "utf-8");
    return filePath;
  }

  const simpleWorker = `---
name: simple-worker
description: A simple test worker
---
You are a helpful assistant.
`;

  const anotherWorker = `---
name: another-worker
description: Another test worker
---
Do something else.
`;

  describe("constructor", () => {
    it("creates registry with default options", () => {
      const registry = new WorkerRegistry();
      expect(registry.getSearchPaths()).toEqual([]);
    });

    it("creates registry with custom search paths", () => {
      const registry = new WorkerRegistry({
        searchPaths: ["/path/one", "/path/two"],
      });
      expect(registry.getSearchPaths()).toHaveLength(2);
    });
  });

  describe("addSearchPath", () => {
    it("adds a search path", () => {
      const registry = new WorkerRegistry();
      registry.addSearchPath(tempDir);
      expect(registry.getSearchPaths()).toContain(path.resolve(tempDir));
    });

    it("does not add duplicate paths", () => {
      const registry = new WorkerRegistry();
      registry.addSearchPath(tempDir);
      registry.addSearchPath(tempDir);
      expect(registry.getSearchPaths()).toHaveLength(1);
    });
  });

  describe("scanDirectory", () => {
    it("finds worker files in directory", async () => {
      await createWorkerFile("simple-worker", simpleWorker);
      await createWorkerFile("another-worker", anotherWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanDirectory(tempDir);

      const workers = await registry.list();
      expect(workers).toHaveLength(2);
    });

    it("scans subdirectories", async () => {
      await createWorkerFile("top-worker", simpleWorker);
      await createWorkerFile("nested-worker", anotherWorker, "subdir");

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanDirectory(tempDir);

      const workers = await registry.list();
      expect(workers).toHaveLength(2);
    });

    it("skips hidden directories", async () => {
      await createWorkerFile("visible-worker", simpleWorker.replace("simple-worker", "visible-worker"));
      await createWorkerFile("hidden-worker", anotherWorker.replace("another-worker", "hidden-worker"), ".hidden");

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanDirectory(tempDir);

      const workers = await registry.list();
      expect(workers).toHaveLength(1);
      expect(workers[0].definition.name).toBe("visible-worker");
    });

    it("skips node_modules", async () => {
      await createWorkerFile("app-worker", simpleWorker.replace("simple-worker", "app-worker"));
      await createWorkerFile("dep-worker", anotherWorker.replace("another-worker", "dep-worker"), "node_modules");

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanDirectory(tempDir);

      const workers = await registry.list();
      expect(workers).toHaveLength(1);
      expect(workers[0].definition.name).toBe("app-worker");
    });

    it("handles non-existent directories gracefully", async () => {
      const registry = new WorkerRegistry();
      await registry.scanDirectory("/non/existent/path");
      // Should not throw
      const workers = await registry.list();
      expect(workers).toHaveLength(0);
    });
  });

  describe("loadWorker", () => {
    it("loads a worker file", async () => {
      const filePath = await createWorkerFile("test-worker", simpleWorker);

      const registry = new WorkerRegistry();
      const result = await registry.loadWorker(filePath);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe("simple-worker");
      }
    });

    it("caches loaded workers", async () => {
      const filePath = await createWorkerFile("test-worker", simpleWorker);

      const registry = new WorkerRegistry();
      await registry.loadWorker(filePath);
      await registry.loadWorker(filePath);

      const stats = registry.getStats();
      expect(stats.cachedCount).toBe(1);
    });

    it("reloads when file changes", async () => {
      const filePath = await createWorkerFile("test-worker", simpleWorker);

      const registry = new WorkerRegistry();
      await registry.loadWorker(filePath);

      // Wait a bit and modify the file
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedContent = simpleWorker.replace("simple-worker", "updated-worker");
      await fs.writeFile(filePath, updatedContent, "utf-8");

      const result = await registry.loadWorker(filePath);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe("updated-worker");
      }
    });

    it("returns error for invalid worker", async () => {
      const filePath = await createWorkerFile(
        "invalid-worker",
        `---
invalid: true
---
No name field!
`
      );

      const registry = new WorkerRegistry();
      const result = await registry.loadWorker(filePath);

      expect(result.success).toBe(false);
    });

    it("returns error for non-existent file", async () => {
      const registry = new WorkerRegistry();
      const result = await registry.loadWorker("/non/existent/file.worker");

      expect(result.success).toBe(false);
    });
  });

  describe("get", () => {
    it("looks up worker by name", async () => {
      await createWorkerFile("my-worker", simpleWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanAll();

      const result = await registry.get("simple-worker");
      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.worker.definition.name).toBe("simple-worker");
      }
    });

    it("looks up worker by file path", async () => {
      const filePath = await createWorkerFile("my-worker", simpleWorker);

      const registry = new WorkerRegistry();
      const result = await registry.get(filePath);

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.worker.definition.name).toBe("simple-worker");
      }
    });

    it("finds worker by direct name match", async () => {
      // Create worker file with matching filename
      await createWorkerFile("simple-worker", simpleWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const result = await registry.get("simple-worker");

      expect(result.found).toBe(true);
    });

    it("finds worker in subdirectory with matching name", async () => {
      // Create workers/myworker/myworker.worker structure
      await createWorkerFile("myworker", simpleWorker.replace("simple-worker", "myworker"), "myworker");

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const result = await registry.get("myworker");

      expect(result.found).toBe(true);
      if (result.found) {
        expect(result.worker.definition.name).toBe("myworker");
      }
    });

    it("returns not found for unknown worker", async () => {
      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const result = await registry.get("unknown-worker");

      expect(result.found).toBe(false);
      if (!result.found) {
        expect(result.error).toContain("not found");
      }
    });

    it("scans automatically on lookup", async () => {
      await createWorkerFile("auto-scan-worker", simpleWorker.replace("simple-worker", "auto-scan-worker"));

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      // Don't call scanAll explicitly
      const result = await registry.get("auto-scan-worker");

      expect(result.found).toBe(true);
    });
  });

  describe("list", () => {
    it("lists all workers", async () => {
      await createWorkerFile("worker-1", simpleWorker);
      await createWorkerFile("worker-2", anotherWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const workers = await registry.list();

      expect(workers).toHaveLength(2);
    });

    it("returns empty array when no workers", async () => {
      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const workers = await registry.list();

      expect(workers).toEqual([]);
    });
  });

  describe("listNames", () => {
    it("lists worker names", async () => {
      await createWorkerFile("worker-1", simpleWorker);
      await createWorkerFile("worker-2", anotherWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      const names = await registry.listNames();

      expect(names).toHaveLength(2);
      expect(names).toContain("simple-worker");
      expect(names).toContain("another-worker");
    });
  });

  describe("refresh", () => {
    it("clears cache and rescans", async () => {
      await createWorkerFile("original-worker", simpleWorker);

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanAll();

      // Add a new worker file
      await createWorkerFile("new-worker", anotherWorker);

      // refresh() clears scanned set and rescans
      await registry.refresh();

      const workers = await registry.list();
      expect(workers).toHaveLength(2);
    });
  });

  describe("getStats", () => {
    it("returns cache statistics", async () => {
      await createWorkerFile("worker-1", simpleWorker);
      await createWorkerFile("worker-2", anotherWorker, "subdir");

      const registry = new WorkerRegistry({ searchPaths: [tempDir] });
      await registry.scanAll();

      const stats = registry.getStats();
      expect(stats.cachedCount).toBe(2);
      expect(stats.searchPaths).toBe(1);
      expect(stats.scannedDirs).toBeGreaterThan(0);
    });
  });

  describe("createWorkerRegistry", () => {
    it("creates registry with factory function", () => {
      const registry = createWorkerRegistry({ searchPaths: [tempDir] });
      expect(registry).toBeInstanceOf(WorkerRegistry);
      expect(registry.getSearchPaths()).toContain(path.resolve(tempDir));
    });
  });
});
