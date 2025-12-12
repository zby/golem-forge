/**
 * Main content area - renders messages and UI elements
 */

import React from "react";
import { Box, Text } from "ink";
import {
  useTheme,
  useMessages,
  useStreaming,
  usePendingApproval,
  useUIError,
  useApprovalActions,
} from "../../contexts/index.js";
import {
  UserMessage,
  AssistantMessage,
  SystemMessage,
  WorkerStartMessage,
  WorkerCompleteMessage,
  StatusMessage,
} from "../messages/index.js";
import { ApprovalDialog } from "../dialogs/index.js";
import { ToolResultDisplay } from "../shared/index.js";
import type { UIMessage } from "@golem-forge/ui-react";

export function MainContent(): React.ReactElement {
  const theme = useTheme();
  const messages = useMessages();
  const streaming = useStreaming();
  const pendingApproval = usePendingApproval();
  const { respond } = useApprovalActions();
  const error = useUIError();

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1}>
      {/* Message history */}
      {messages.map((msg, i) => (
        <MessageRenderer key={i} message={msg} />
      ))}

      {/* Streaming content */}
      {streaming.isStreaming && streaming.content && (
        <AssistantMessage content={streaming.content} isStreaming />
      )}

      {/* Pending approval */}
      {pendingApproval && (
        <ApprovalDialog request={pendingApproval} onResult={respond} />
      )}

      {/* Error display */}
      {error && (
        <Box
          borderStyle="round"
          borderColor={theme.colors.status.error}
          paddingX={1}
        >
          <Text color={theme.colors.status.error}>{error}</Text>
        </Box>
      )}
    </Box>
  );
}

interface MessageRendererProps {
  message: UIMessage;
}

function MessageRenderer({ message }: MessageRendererProps): React.ReactElement {
  switch (message.type) {
    case "message":
      switch (message.message.role) {
        case "user":
          return <UserMessage content={message.message.content} />;
        case "assistant":
          return <AssistantMessage content={message.message.content} />;
        case "system":
          return <SystemMessage content={message.message.content} />;
      }
      break;

    case "tool_result":
      return <ToolResultDisplay result={message.result} />;

    case "status":
      return <StatusMessage status={message.status} />;

    case "worker_start":
      return (
        <WorkerStartMessage
          workerId={message.workerId}
          task={message.task}
          model={message.model}
          tools={message.tools}
        />
      );

    case "worker_complete":
      return (
        <WorkerCompleteMessage
          workerId={message.workerId}
          success={message.success}
        />
      );
  }

  // Fallback (should not happen)
  return <Text>Unknown message type</Text>;
}
