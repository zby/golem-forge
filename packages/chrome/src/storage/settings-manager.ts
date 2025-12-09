/**
 * Settings Manager
 *
 * Manages API keys and extension settings in chrome.storage.local.
 */

import {
  APIKeyConfig,
  APIKeyConfigSchema,
  ExtensionSettings,
  ExtensionSettingsSchema,
  LLMProvider,
  STORAGE_KEYS,
} from './types';

/**
 * Default extension settings.
 */
const DEFAULT_SETTINGS: ExtensionSettings = {
  defaultProvider: 'anthropic',
  defaultModel: 'claude-sonnet-4-20250514',
  showApprovals: true,
  maxIterations: 50,
};

/**
 * Settings Manager service for managing API keys and extension settings.
 */
export class SettingsManager {
  // ─────────────────────────────────────────────────────────────────────────
  // API Keys
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all API key configurations.
   */
  async getAPIKeys(): Promise<APIKeyConfig[]> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.API_KEYS);
    const keys = result[STORAGE_KEYS.API_KEYS] || [];
    return keys.map((k: unknown) => APIKeyConfigSchema.parse(k));
  }

  /**
   * Get API key for a specific provider.
   */
  async getAPIKey(provider: LLMProvider): Promise<string | null> {
    const keys = await this.getAPIKeys();
    const config = keys.find((k) => k.provider === provider);
    return config?.apiKey || null;
  }

  /**
   * Set API key for a provider.
   */
  async setAPIKey(
    provider: LLMProvider,
    apiKey: string,
    validated = false
  ): Promise<void> {
    const keys = await this.getAPIKeys();
    const index = keys.findIndex((k) => k.provider === provider);

    const config: APIKeyConfig = {
      provider,
      apiKey,
      validated,
      lastValidated: validated ? Date.now() : undefined,
    };

    if (index >= 0) {
      keys[index] = config;
    } else {
      keys.push(config);
    }

    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEYS]: keys });
  }

  /**
   * Delete API key for a provider.
   */
  async deleteAPIKey(provider: LLMProvider): Promise<void> {
    const keys = await this.getAPIKeys();
    const filtered = keys.filter((k) => k.provider !== provider);
    await chrome.storage.local.set({ [STORAGE_KEYS.API_KEYS]: filtered });
  }

  /**
   * Mark an API key as validated.
   */
  async markAPIKeyValidated(provider: LLMProvider): Promise<void> {
    const keys = await this.getAPIKeys();
    const index = keys.findIndex((k) => k.provider === provider);

    if (index >= 0) {
      keys[index].validated = true;
      keys[index].lastValidated = Date.now();
      await chrome.storage.local.set({ [STORAGE_KEYS.API_KEYS]: keys });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Extension Settings
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get extension settings.
   */
  async getSettings(): Promise<ExtensionSettings> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    const settings = result[STORAGE_KEYS.SETTINGS];

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return ExtensionSettingsSchema.parse({
      ...DEFAULT_SETTINGS,
      ...settings,
    });
  }

  /**
   * Update extension settings.
   */
  async updateSettings(
    updates: Partial<ExtensionSettings>
  ): Promise<ExtensionSettings> {
    const current = await this.getSettings();
    const updated = ExtensionSettingsSchema.parse({
      ...current,
      ...updates,
    });

    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return updated;
  }

  /**
   * Reset settings to defaults.
   */
  async resetSettings(): Promise<ExtensionSettings> {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: DEFAULT_SETTINGS });
    return DEFAULT_SETTINGS;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // GitHub Token
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get GitHub token (for authenticated API access).
   */
  async getGitHubToken(): Promise<string | null> {
    const result = await chrome.storage.local.get(STORAGE_KEYS.GITHUB_TOKEN);
    return result[STORAGE_KEYS.GITHUB_TOKEN] || null;
  }

  /**
   * Set GitHub token.
   */
  async setGitHubToken(token: string): Promise<void> {
    await chrome.storage.local.set({ [STORAGE_KEYS.GITHUB_TOKEN]: token });
  }

  /**
   * Delete GitHub token.
   */
  async deleteGitHubToken(): Promise<void> {
    await chrome.storage.local.remove(STORAGE_KEYS.GITHUB_TOKEN);
  }
}

// Singleton instance
export const settingsManager = new SettingsManager();
