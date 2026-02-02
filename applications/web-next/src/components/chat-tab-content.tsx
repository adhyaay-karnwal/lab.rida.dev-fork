"use client";

import { useEffect, useRef } from "react";
import { Chat, useChat } from "@/components/chat";
import { TextAreaGroup } from "@/components/textarea-group";
import { MessagePart } from "@/components/message-part";
import { useModelSelection } from "@/lib/hooks";
import type { MessageState } from "@/lib/use-agent";

type ChatTabContentProps = {
  messages: MessageState[];
};

export function ChatTabContent({ messages }: ChatTabContentProps) {
  const { state, actions } = useChat();
  const { modelGroups, modelId, setModelId } = useModelSelection({
    syncTo: actions.setModelId,
    currentSyncedValue: state.modelId,
  });
  const isStreamingRef = useRef(false);

  const lastMessage = messages[messages.length - 1];
  const isStreaming = lastMessage?.role === "assistant";

  useEffect(() => {
    if (isStreaming) {
      isStreamingRef.current = true;
      actions.scrollToBottom();
    } else if (isStreamingRef.current) {
      isStreamingRef.current = false;
    }
  }, [isStreaming, lastMessage?.parts.length, actions]);

  return (
    <Chat.MessageList>
      <Chat.Messages>
        {messages.flatMap((message) =>
          message.parts.map((part) => (
            <Chat.Block key={part.id} role={message.role}>
              <MessagePart.Root
                part={part}
                isStreaming={
                  message.role === "assistant" && message === messages[messages.length - 1]
                }
              />
            </Chat.Block>
          )),
        )}
      </Chat.Messages>
      <Chat.Input>
        {modelGroups && modelId && (
          <TextAreaGroup.ModelSelector value={modelId} groups={modelGroups} onChange={setModelId} />
        )}
      </Chat.Input>
    </Chat.MessageList>
  );
}
