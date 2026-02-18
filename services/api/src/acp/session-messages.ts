import { MESSAGE_ROLE, type MessageRole } from "../types/message";

type ToolCallStatus = "in_progress" | "completed" | "error";

interface TextPart {
  type: "text";
  text: string;
}

interface ToolCallPart {
  type: "tool_call";
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: ToolCallStatus;
}

interface ToolResultPart {
  type: "tool_result";
  tool_call_id: string;
  output?: string;
  error?: string;
}

export type ProjectedContentPart = TextPart | ToolCallPart | ToolResultPart;

export interface ProjectedMessage {
  id: string;
  role: MessageRole;
  parts: ProjectedContentPart[];
}

export interface SessionMessagesSnapshot {
  messages: ProjectedMessage[];
  questionRequests: [string, string][];
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value));
  }
  return null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function extractSessionUpdate(
  envelope: Record<string, unknown>
): Record<string, unknown> | null {
  if (envelope.method !== "session/update") {
    return null;
  }
  const params = toRecord(envelope.params);
  if (!params) {
    return null;
  }
  return toRecord(params.update);
}

function extractNestedTextParts(content: unknown[]): string {
  return content
    .map((part) => {
      const partRecord = toRecord(part);
      if (!partRecord) {
        return "";
      }
      const nested = toRecord(partRecord.content);
      return nested ? getString(nested.text) : "";
    })
    .join("");
}

function extractTextParts(content: unknown[]): string {
  return content
    .map((part) => {
      const partRecord = toRecord(part);
      return partRecord ? getString(partRecord.text) : "";
    })
    .join("");
}

function extractToolCallOutput(update: Record<string, unknown>): string | null {
  const meta = toRecord(update._meta);
  const claudeCode = meta ? toRecord(meta.claudeCode) : null;
  const toolResponse = claudeCode ? toRecord(claudeCode.toolResponse) : null;

  if (toolResponse) {
    const responseContent = Array.isArray(toolResponse.content)
      ? toolResponse.content
      : [];
    return extractTextParts(responseContent);
  }

  const rawOutput = getString(update.rawOutput);
  if (rawOutput) {
    return rawOutput;
  }

  const content = Array.isArray(update.content) ? update.content : [];
  const nestedOutput = extractNestedTextParts(content);
  if (nestedOutput) {
    return nestedOutput;
  }

  const status = getString(update.status);
  const isTerminalStatus =
    status === "completed" || status === "failed" || status === "error";
  return isTerminalStatus ? "" : null;
}

function extractTextFromMessage(message: ProjectedMessage): string {
  return message.parts
    .filter((part): part is TextPart => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}

export function getLastAssistantPreview(
  snapshot: SessionMessagesSnapshot
): string | undefined {
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.role !== MESSAGE_ROLE.ASSISTANT) {
      continue;
    }
    const text = extractTextFromMessage(message);
    if (text) {
      return text;
    }
  }
  return undefined;
}

export class SessionMessagesProjector {
  private readonly messages: ProjectedMessage[] = [];
  private readonly messageById = new Map<string, ProjectedMessage>();
  private readonly toolCallToMessageId = new Map<string, string>();
  private readonly questionRequests = new Map<string, string>();
  private activeAssistantMessageId: string | null = null;
  private messageCounter = 0;

  applyEnvelope(envelope: unknown, sequence: number): void {
    const envelopeRecord = toRecord(envelope);
    if (!envelopeRecord) {
      return;
    }

    const result = toRecord(envelopeRecord.result);
    if (result && getString(result.stopReason)) {
      this.activeAssistantMessageId = null;
      return;
    }
    if (result) {
      return;
    }

    const update = extractSessionUpdate(envelopeRecord);
    if (!update) {
      return;
    }

    const updateType = getString(update.sessionUpdate);
    switch (updateType) {
      case "user_message":
        this.handleUserMessage(update, sequence);
        break;
      case "agent_message_chunk":
        this.handleAgentChunk(update, sequence);
        break;
      case "tool_call":
        this.handleToolCall(update, sequence);
        break;
      case "tool_call_update":
        this.handleToolCallUpdate(update, sequence);
        break;
      case "question.requested":
      case "question_requested":
        this.handleQuestionRequested(update);
        break;
      case "question.resolved":
      case "question_resolved":
        this.handleQuestionResolved(update);
        break;
      default:
        break;
    }
  }

  getSnapshot(): SessionMessagesSnapshot {
    return {
      messages: this.messages.map((message) => ({
        ...message,
        parts: message.parts.map((part) => ({ ...part })),
      })),
      questionRequests: [...this.questionRequests.entries()],
    };
  }

  getLastAssistantPreview(): string | undefined {
    return getLastAssistantPreview(this.getSnapshot());
  }

  private handleUserMessage(
    update: Record<string, unknown>,
    sequence: number
  ): void {
    const content = toRecord(update.content);
    const text = content ? getString(content.text).trim() : "";
    if (!text) {
      return;
    }

    this.activeAssistantMessageId = null;
    this.appendMessage({
      id: `user-${sequence}`,
      role: MESSAGE_ROLE.USER,
      parts: [{ type: "text", text }],
    });
  }

  private handleAgentChunk(
    update: Record<string, unknown>,
    sequence: number
  ): void {
    const content = toRecord(update.content);
    const text = content ? getString(content.text) : "";
    if (!text) {
      return;
    }

    const message = this.ensureAssistantMessage(sequence, true);
    const lastPart = message.parts.at(-1);
    if (lastPart?.type === "text") {
      lastPart.text += text;
      return;
    }
    message.parts.push({ type: "text", text });
  }

  private handleToolCall(
    update: Record<string, unknown>,
    sequence: number
  ): void {
    const callId = getString(update.toolCallId);
    if (!callId) {
      return;
    }

    const rawInput = toRecord(update.rawInput) ?? {};
    const meta = toRecord(update._meta);
    const claudeCode = meta ? toRecord(meta.claudeCode) : null;
    const toolName = claudeCode ? getString(claudeCode.toolName) : "";

    const existingMessageId = this.toolCallToMessageId.get(callId);
    const existingMessage = existingMessageId
      ? this.messageById.get(existingMessageId)
      : undefined;
    if (existingMessage) {
      const existingPart = existingMessage.parts.find(
        (part): part is ToolCallPart =>
          part.type === "tool_call" && part.id === callId
      );
      if (existingPart) {
        if (!existingPart.name && toolName) {
          existingPart.name = toolName;
        }
        if (Object.keys(existingPart.input).length === 0) {
          existingPart.input = rawInput;
        }
        this.activeAssistantMessageId = existingMessage.id;
        return;
      }
    }

    const activeMessage = this.getActiveAssistantMessage();
    const shouldStartNewMessage = Boolean(
      activeMessage && activeMessage.parts.length > 0
    );
    const message = shouldStartNewMessage
      ? this.createAssistantMessage(sequence)
      : this.ensureAssistantMessage(sequence, false);

    const existingPart = message.parts.find(
      (part): part is ToolCallPart =>
        part.type === "tool_call" && part.id === callId
    );
    if (!existingPart) {
      message.parts.push({
        type: "tool_call",
        id: callId,
        name: toolName,
        input: rawInput,
        status: "in_progress",
      });
    }
    this.toolCallToMessageId.set(callId, message.id);
  }

  private handleToolCallUpdate(
    update: Record<string, unknown>,
    sequence: number
  ): void {
    const callId = getString(update.toolCallId);
    if (!callId) {
      return;
    }

    const output = extractToolCallOutput(update);
    if (output === null) {
      return;
    }

    const message = this.resolveToolMessage(callId, sequence);
    const status = getString(update.status);
    const isError = status === "failed" || status === "error";
    let nextStatus: ToolCallStatus = "completed";
    if (isError) {
      nextStatus = "error";
    }

    const toolCallPart = message.parts.find(
      (part): part is ToolCallPart =>
        part.type === "tool_call" && part.id === callId
    );
    if (toolCallPart) {
      toolCallPart.status = nextStatus;
    } else {
      message.parts.push({
        type: "tool_call",
        id: callId,
        name: "",
        input: {},
        status: nextStatus,
      });
    }

    const existingResult = message.parts.find(
      (part): part is ToolResultPart =>
        part.type === "tool_result" && part.tool_call_id === callId
    );
    if (existingResult) {
      if (isError) {
        existingResult.error = output;
      } else {
        existingResult.output = output;
      }
      return;
    }

    message.parts.push({
      type: "tool_result",
      tool_call_id: callId,
      ...(isError ? { error: output } : { output }),
    });
  }

  private handleQuestionRequested(update: Record<string, unknown>): void {
    const questionId = getString(update.id);
    const callId = getString(update.call_id);
    if (!(questionId && callId)) {
      return;
    }
    this.questionRequests.set(callId, questionId);
  }

  private handleQuestionResolved(update: Record<string, unknown>): void {
    const callId = getString(update.call_id);
    if (callId) {
      this.questionRequests.delete(callId);
    }
  }

  private ensureAssistantMessage(
    sequence: number,
    splitWhenToolPartsExist: boolean
  ): ProjectedMessage {
    const active = this.getActiveAssistantMessage();
    if (active) {
      const hasToolParts = active.parts.some(
        (part) => part.type === "tool_call" || part.type === "tool_result"
      );
      if (!(splitWhenToolPartsExist && hasToolParts)) {
        return active;
      }
    }

    return this.createAssistantMessage(sequence);
  }

  private resolveToolMessage(
    callId: string,
    sequence: number
  ): ProjectedMessage {
    const messageId = this.toolCallToMessageId.get(callId);
    if (messageId) {
      const message = this.messageById.get(messageId);
      if (message) {
        return message;
      }
    }

    const message = this.ensureAssistantMessage(sequence, false);
    this.toolCallToMessageId.set(callId, message.id);
    return message;
  }

  private getActiveAssistantMessage(): ProjectedMessage | null {
    if (!this.activeAssistantMessageId) {
      return null;
    }
    return this.messageById.get(this.activeAssistantMessageId) ?? null;
  }

  private createAssistantMessage(sequence: number): ProjectedMessage {
    this.messageCounter += 1;
    const message: ProjectedMessage = {
      id: `assistant-${sequence}-${this.messageCounter}`,
      role: MESSAGE_ROLE.ASSISTANT,
      parts: [],
    };
    this.appendMessage(message);
    this.activeAssistantMessageId = message.id;
    return message;
  }

  private appendMessage(message: ProjectedMessage): void {
    this.messages.push(message);
    this.messageById.set(message.id, message);
  }
}

export function projectSessionMessages(
  events: Array<{ sequence: number; eventData: unknown }>
): SessionMessagesSnapshot {
  const projector = new SessionMessagesProjector();
  for (const event of events) {
    projector.applyEnvelope(event.eventData, event.sequence);
  }
  return projector.getSnapshot();
}
