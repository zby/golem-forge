/**
 * Model Factory
 *
 * Abstraction for creating AI models across different platforms.
 * Platforms (CLI, Chrome) provide their own implementations with
 * platform-specific API key sources and configuration.
 */

import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

// ============================================================================
// Types
// ============================================================================

/**
 * Supported AI providers.
 */
export type AIProvider = "anthropic" | "openai" | "google" | "openrouter";

/**
 * Parsed model identifier.
 */
export interface ParsedModelId {
  provider: AIProvider;
  model: string;
}

/**
 * Options for creating a provider.
 */
export interface ProviderOptions {
  /** API key for the provider */
  apiKey: string;
  /** Additional headers (e.g., for browser access) */
  headers?: Record<string, string>;
  /** Base URL override (e.g., for OpenRouter) */
  baseURL?: string;
}

/**
 * Interface for model factories.
 * Platforms implement this to provide custom API key resolution.
 */
export interface ModelFactory {
  /**
   * Create a language model for the given model ID.
   * @param modelId - Model identifier (e.g., "anthropic:claude-sonnet-4-20250514")
   */
  createModel(modelId: string): Promise<LanguageModel>;
}

/**
 * Interface for API key providers.
 * Platforms implement this to provide API keys from their storage.
 */
export interface APIKeyProvider {
  /**
   * Get the API key for a provider.
   * @param provider - The AI provider
   * @returns The API key or null if not configured
   */
  getAPIKey(provider: AIProvider): Promise<string | null>;

  /**
   * Get provider-specific options (headers, base URL, etc.)
   * @param provider - The AI provider
   * @returns Additional options for the provider
   */
  getProviderOptions?(provider: AIProvider): Promise<Partial<ProviderOptions>>;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse a model identifier like "anthropic:claude-sonnet-4-20250514"
 * into provider and model parts.
 */
export function parseModelId(modelId: string): ParsedModelId {
  const parts = modelId.split(":");
  if (parts.length !== 2) {
    throw new Error(
      `Invalid model ID format: ${modelId}. Expected format: provider:model`
    );
  }

  const provider = parts[0] as AIProvider;
  const validProviders: AIProvider[] = ["anthropic", "openai", "google", "openrouter"];
  if (!validProviders.includes(provider)) {
    throw new Error(
      `Unsupported provider: ${provider}. Supported: ${validProviders.join(", ")}`
    );
  }

  return { provider, model: parts[1] };
}

// ============================================================================
// Provider Creation
// ============================================================================

/**
 * Create a language model with explicit options.
 * Used by platform-specific factories.
 */
export function createModelWithOptions(
  modelId: string,
  options: ProviderOptions
): LanguageModel {
  const { provider, model } = parseModelId(modelId);

  switch (provider) {
    case "anthropic": {
      const anthropicProvider = createAnthropic({
        apiKey: options.apiKey,
        headers: options.headers,
      });
      return anthropicProvider(model);
    }
    case "openai": {
      const openaiProvider = createOpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL,
      });
      return openaiProvider(model);
    }
    case "google": {
      const googleProvider = createGoogleGenerativeAI({
        apiKey: options.apiKey,
      });
      return googleProvider(model);
    }
    case "openrouter": {
      // OpenRouter uses OpenAI-compatible API
      const openrouterProvider = createOpenAI({
        apiKey: options.apiKey,
        baseURL: options.baseURL || "https://openrouter.ai/api/v1",
      });
      return openrouterProvider(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// ============================================================================
// Default Factory (Environment Variables)
// ============================================================================

/**
 * Default API key provider that reads from environment variables.
 * Used by CLI and other Node.js environments.
 */
export class EnvironmentAPIKeyProvider implements APIKeyProvider {
  async getAPIKey(provider: AIProvider): Promise<string | null> {
    switch (provider) {
      case "anthropic":
        return process.env.ANTHROPIC_API_KEY || null;
      case "openai":
        return process.env.OPENAI_API_KEY || null;
      case "google":
        return process.env.GOOGLE_GENERATIVE_AI_API_KEY || null;
      case "openrouter":
        return process.env.OPENROUTER_API_KEY || null;
      default:
        return null;
    }
  }
}

/**
 * Default model factory that uses environment variables for API keys.
 * This is what core uses by default (CLI behavior).
 */
export class DefaultModelFactory implements ModelFactory {
  private apiKeyProvider: APIKeyProvider;

  constructor(apiKeyProvider?: APIKeyProvider) {
    this.apiKeyProvider = apiKeyProvider || new EnvironmentAPIKeyProvider();
  }

  async createModel(modelId: string): Promise<LanguageModel> {
    const { provider } = parseModelId(modelId);
    const apiKey = await this.apiKeyProvider.getAPIKey(provider);

    if (!apiKey) {
      throw new Error(
        `No API key configured for ${provider}. ` +
        `Set the appropriate environment variable (e.g., ANTHROPIC_API_KEY).`
      );
    }

    const extraOptions = await this.apiKeyProvider.getProviderOptions?.(provider);

    return createModelWithOptions(modelId, {
      apiKey,
      ...extraOptions,
    });
  }
}

/**
 * Create the default model factory.
 */
export function createDefaultModelFactory(): ModelFactory {
  return new DefaultModelFactory();
}
