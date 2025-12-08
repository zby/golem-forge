/**
 * Browser AI Service
 *
 * Provider management for LLM APIs in the browser extension.
 * Uses Vercel AI SDK with browser-specific configuration.
 *
 * See docs/notes/ai-sdk-browser-lessons.md for validation details.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';
import { settingsManager } from '../storage/settings-manager';
import type { LLMProvider } from '../storage/types';

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[GolemForge AI]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModelInfo {
  provider: LLMProvider;
  model: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Model ID Parsing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a model identifier like "anthropic:claude-sonnet-4-20250514"
 * into provider and model parts.
 */
export function parseModelId(modelId: string): ModelInfo {
  const parts = modelId.split(':');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid model ID format: ${modelId}. Expected format: provider:model`
    );
  }

  const provider = parts[0] as LLMProvider;
  if (!['anthropic', 'openai', 'google', 'openrouter'].includes(provider)) {
    throw new Error(
      `Unsupported provider: ${provider}. Supported: anthropic, openai, google, openrouter`
    );
  }

  return { provider, model: parts[1] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an Anthropic provider with browser-safe configuration.
 *
 * Requires the `anthropic-dangerous-direct-browser-access` header.
 */
function createAnthropicProvider(apiKey: string) {
  return createAnthropic({
    apiKey,
    headers: {
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  });
}

/**
 * Create an OpenAI provider with browser-safe configuration.
 *
 * Note: AI SDK v6 beta may not support dangerouslyAllowBrowser yet.
 * The extension's host_permissions should handle CORS.
 */
function createOpenAIProvider(apiKey: string) {
  return createOpenAI({
    apiKey,
    // dangerouslyAllowBrowser is handled by extension host_permissions
  });
}

/**
 * Create a Google provider.
 */
function createGoogleProvider(apiKey: string) {
  return createGoogleGenerativeAI({
    apiKey,
  });
}

/**
 * Create an OpenRouter provider.
 *
 * OpenRouter uses OpenAI-compatible API with a different base URL.
 */
function createOpenRouterProvider(apiKey: string) {
  return createOpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Browser AI Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser AI Service for managing LLM providers.
 *
 * Provides:
 * - API key validation
 * - Model creation with browser-safe configuration
 * - Provider management
 */
export class BrowserAIService {
  // Cache could be used for provider reuse (currently unused)

  /**
   * Create a language model for the given model ID.
   *
   * @param modelId - Model identifier (e.g., "anthropic:claude-sonnet-4-20250514")
   * @returns LanguageModel instance
   * @throws Error if API key is not configured
   */
  async createModel(modelId: string): Promise<LanguageModel> {
    log('Creating model:', modelId);

    const { provider, model } = parseModelId(modelId);
    const apiKey = await settingsManager.getAPIKey(provider);

    if (!apiKey) {
      const errorMsg = `No API key configured for ${provider}. Please add your API key in Settings.`;
      logError(errorMsg);
      throw new Error(errorMsg);
    }

    log('API key found for provider:', provider, '(length:', apiKey.length, ')');

    try {
      switch (provider) {
        case 'anthropic': {
          const anthropicProvider = createAnthropicProvider(apiKey);
          log('Created Anthropic provider, model:', model);
          return anthropicProvider(model);
        }
        case 'openai': {
          const openaiProvider = createOpenAIProvider(apiKey);
          log('Created OpenAI provider, model:', model);
          return openaiProvider(model);
        }
        case 'google': {
          const googleProvider = createGoogleProvider(apiKey);
          log('Created Google provider, model:', model);
          return googleProvider(model);
        }
        case 'openrouter': {
          const openrouterProvider = createOpenRouterProvider(apiKey);
          log('Created OpenRouter provider, model:', model);
          return openrouterProvider(model);
        }
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }
    } catch (error) {
      logError('Error creating model:', error);
      throw error;
    }
  }

  /**
   * Check if an API key can create a provider instance.
   *
   * NOTE: This is a "cheap" validation that only verifies the provider can be
   * instantiated with the given key. It does NOT make an actual API call to
   * verify the key is valid. Real validation would require making a billable
   * API request to the provider.
   *
   * @param provider - The provider to validate
   * @param apiKey - The API key to test
   * @returns true if provider creation succeeds, false otherwise
   */
  async validateAPIKey(provider: LLMProvider, apiKey: string): Promise<boolean> {
    try {
      // Try to create a provider instance - this validates basic key format
      // but does NOT verify the key is actually valid with the provider
      let testModel: LanguageModel;

      switch (provider) {
        case 'anthropic': {
          const anthropicProvider = createAnthropicProvider(apiKey);
          testModel = anthropicProvider('claude-haiku-4-20250514');
          break;
        }
        case 'openai': {
          const openaiProvider = createOpenAIProvider(apiKey);
          testModel = openaiProvider('gpt-4o-mini');
          break;
        }
        case 'google': {
          const googleProvider = createGoogleProvider(apiKey);
          testModel = googleProvider('gemini-1.5-flash');
          break;
        }
        case 'openrouter': {
          const openrouterProvider = createOpenRouterProvider(apiKey);
          testModel = openrouterProvider('anthropic/claude-3.5-haiku');
          break;
        }
        default:
          return false;
      }

      return testModel !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get the default model ID based on settings.
   */
  async getDefaultModelId(): Promise<string> {
    const settings = await settingsManager.getSettings();
    return `${settings.defaultProvider}:${settings.defaultModel}`;
  }

  /**
   * Check if a provider has an API key configured.
   */
  async hasAPIKey(provider: LLMProvider): Promise<boolean> {
    const key = await settingsManager.getAPIKey(provider);
    return key !== null && key.length > 0;
  }

  /**
   * Get available providers (those with API keys configured).
   */
  async getAvailableProviders(): Promise<LLMProvider[]> {
    const providers: LLMProvider[] = ['anthropic', 'openai', 'google', 'openrouter'];
    const available: LLMProvider[] = [];

    for (const provider of providers) {
      if (await this.hasAPIKey(provider)) {
        available.push(provider);
      }
    }

    return available;
  }
}

// Singleton instance
export const browserAIService = new BrowserAIService();
