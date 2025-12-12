import { describe, it, expect, vi, beforeEach } from "vitest";

const createAnthropicMock = vi.fn(() => (model: string) => ({ provider: "anthropic", model } as any));
const createOpenAIMock = vi.fn(() => (model: string) => ({ provider: "openai", model } as any));
const createGoogleMock = vi.fn(() => (model: string) => ({ provider: "google", model } as any));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropicMock,
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: createOpenAIMock,
}));

vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: createGoogleMock,
}));

import { createModelWithOptions } from "./model-factory.js";

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

