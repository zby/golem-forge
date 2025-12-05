/**
 * AI SDK Types
 *
 * Type definitions for integrating with Vercel AI SDK.
 * These provide the interface between our tool system and the SDK.
 */

import type { Tool } from "ai";

/**
 * Re-export Tool from AI SDK as our tool type.
 */
export type { Tool };

/**
 * Tool call from the AI model.
 * Maps to Vercel AI SDK's tool call format.
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  toolCallId: string;
  /** Name of the tool to execute */
  toolName: string;
  /** Arguments passed to the tool */
  args: Record<string, unknown>;
}

/**
 * Result of executing a tool.
 */
export interface ToolResult {
  /** The ID of the tool call this result responds to */
  toolCallId: string;
  /** The result content (will be JSON stringified if not a string) */
  result: unknown;
  /** Whether this is an error result */
  isError?: boolean;
}

/**
 * Result of tool execution with additional metadata.
 */
export interface ExecuteToolResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Tool call ID */
  toolCallId: string;
  /** Result if successful */
  result?: unknown;
  /** Error if failed */
  error?: {
    type: string;
    toolName: string;
    message: string;
  };
}

/**
 * Token usage statistics.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

/**
 * Attachment for multimodal inputs.
 * Compatible with both our interface and Vercel AI SDK's file format.
 */
export interface Attachment {
  /** MIME type of the attachment */
  mimeType: string;
  /** File data as Buffer or base64 string */
  data: Buffer | string;
  /** Optional file name */
  name?: string;
}

/**
 * A map of tool names to Tool definitions.
 */
export type ToolMap = Record<string, Tool>;
