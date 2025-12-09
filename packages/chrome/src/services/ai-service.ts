/**
 * Browser AI Service
 *
 * Provider management for LLM APIs in the browser extension.
 * Uses core's model factory with browser-specific configuration.
 *
 * See docs/notes/ai-sdk-browser-lessons.md for validation details.
 */

import {
  createModelWithOptions,
  parseModelId,
  type LanguageModel,
  type AIProvider,
  type ProviderOptions,
} from '@golem-forge/core';
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
// Browser-specific Provider Options
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get browser-specific options for a provider.
 * Adds required headers for browser access.
 */
function getBrowserProviderOptions(provider: AIProvider, apiKey: string): ProviderOptions {
  const baseOptions: ProviderOptions = { apiKey };

  switch (provider) {
    case 'anthropic':
      // Anthropic requires special header for browser access
      return {
        ...baseOptions,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      };
    case 'openrouter':
      // OpenRouter uses OpenAI-compatible API with different base URL
      return {
        ...baseOptions,
        baseURL: 'https://openrouter.ai/api/v1',
      };
    default:
      return baseOptions;
  }
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

    const { provider } = parseModelId(modelId);
    const apiKey = await settingsManager.getAPIKey(provider as LLMProvider);

    if (!apiKey) {
      const errorMsg = `No API key configured for ${provider}. Please add your API key in Settings.`;
      logError(errorMsg);
      throw new Error(errorMsg);
    }

    log('API key found for provider:', provider, '(length:', apiKey.length, ')');

    try {
      // Use core's model factory with browser-specific options
      const options = getBrowserProviderOptions(provider, apiKey);
      const model = createModelWithOptions(modelId, options);
      log('Created model via core factory:', modelId);
      return model;
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
      const testModelIds: Record<LLMProvider, string> = {
        anthropic: 'anthropic:claude-haiku-4-20250514',
        openai: 'openai:gpt-4o-mini',
        google: 'google:gemini-1.5-flash',
        openrouter: 'openrouter:anthropic/claude-3.5-haiku',
      };

      const modelId = testModelIds[provider];
      if (!modelId) {
        return false;
      }

      const options = getBrowserProviderOptions(provider as AIProvider, apiKey);
      const testModel = createModelWithOptions(modelId, options);

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
