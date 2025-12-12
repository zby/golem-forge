import { describe, it, expect, vi, beforeEach } from "vitest";

const { createAnthropicMock, createOpenAIMock, createGoogleMock } = vi.hoisted(() => ({
  createAnthropicMock: vi.fn(() => (model: string) => ({ provider: "anthropic", model } as any)),
  createOpenAIMock: vi.fn(() => (model: string) => ({ provider: "openai", model } as any)),
  createGoogleMock: vi.fn(() => (model: string) => ({ provider: "google", model } as any)),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

import { createModelWithOptions, parseModelId } from "./model-factory.js";

describe("parseModelId", () => {
  it("parses simple model IDs", () => {
    expect(parseModelId("anthropic:claude-3")).toEqual({
      provider: "anthropic",
      model: "claude-3",
    });
  });

  it("parses model IDs with colons in the model name", () => {
    expect(parseModelId("openrouter:openai/gpt-4o:free")).toEqual({
      provider: "openrouter",
      model: "openai/gpt-4o:free",
    });
  });

  it("throws for invalid format (no colon)", () => {
    expect(() => parseModelId("invalid")).toThrow("Invalid model ID format");
  });

  it("throws for invalid format (empty model)", () => {
    expect(() => parseModelId("anthropic:")).toThrow("Invalid model ID format");
  });

  it("throws for unsupported provider", () => {
    expect(() => parseModelId("unknown:model")).toThrow("Unsupported provider");
  });
});

describe("createModelWithOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes headers to OpenAI provider", () => {
    createModelWithOptions("openai:gpt-4", {
      apiKey: "k",
      baseURL: "https://example.com",
      headers: { "x-test": "1" },
    });

    expect(createOpenAIMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "k",
        baseURL: "https://example.com",
        headers: { "x-test": "1" },
      })
    );
  });

  it("passes headers to OpenRouter provider and sets default baseURL", () => {
    createModelWithOptions("openrouter:openai/gpt-4", {
      apiKey: "k",
      headers: { "x-test": "1" },
    });

    expect(createOpenAIMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiKey: "k",
        baseURL: "https://openrouter.ai/api/v1",
        headers: { "x-test": "1" },
      })
    );
  });
});
