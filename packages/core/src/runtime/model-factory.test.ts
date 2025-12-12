import { describe, it, expect, vi, beforeEach } from "vitest";

const { createAnthropicMock, createOpenAIMock, createGoogleMock, openAIChatMock } = vi.hoisted(() => {
  // Track which API method was used
  const openAIChatMock = vi.fn((model: string) => ({ provider: "openai.chat", model } as any));

  return {
    createAnthropicMock: vi.fn(() => (model: string) => ({ provider: "anthropic", model } as any)),
    createOpenAIMock: vi.fn(() => {
      // Return a provider with both default (responses) and .chat() methods
      const provider = (model: string) => ({ provider: "openai.responses", model } as any);
      provider.chat = openAIChatMock;
      provider.responses = (model: string) => ({ provider: "openai.responses", model } as any);
      return provider;
    }),
    createGoogleMock: vi.fn(() => (model: string) => ({ provider: "google", model } as any)),
    openAIChatMock,
  };
});

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

  it("uses Chat Completions API for OpenRouter (not Responses API)", () => {
    // OpenRouter doesn't support OpenAI's Responses API, only Chat Completions
    // AI SDK v6 defaults to Responses API, so we must explicitly use .chat()
    const model = createModelWithOptions("openrouter:mistralai/devstral-2512:free", {
      apiKey: "k",
    });

    // Verify .chat() was called (returns "openai.chat" provider)
    expect(openAIChatMock).toHaveBeenCalledWith("mistralai/devstral-2512:free");
    expect(model).toEqual({
      provider: "openai.chat",
      model: "mistralai/devstral-2512:free",
    });
  });
});
