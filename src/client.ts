import { HttpClient } from "./http.js";
import {
  LineSchema,
  ChatSchema,
  MessageSchema,
  ReactionSchema,
  TypingIndicatorSchema,
  ReadReceiptSchema,
  WebhookSchema,
  OutboxItemSchema,
  FileSchema,
  DeletedResponseSchema,
  ListResponseSchema,
} from "./schemas.js";
import { makePaginatedResponse } from "./pagination.js";
import type {
  ClientConfig,
  MessagesClient,
  SendMessageParams,
  SendReactionParams,
  TypingParams,
  SendReadReceiptParams,
  UploadFileParams,
  ListChatsParams,
  ListMessagesParams,
  ListReactionsParams,
  ListTypingIndicatorsParams,
  ListReadReceiptsParams,
  ListWebhooksParams,
  CreateWebhookParams,
} from "./types.js";

export function createClient(config: ClientConfig = {}): MessagesClient {
  const envKey =
    typeof process !== "undefined" ? process.env?.MESSAGES_API_KEY : undefined;
  const apiKey = config.apiKey ?? envKey;
  if (!apiKey) {
    throw new Error(
      "Missing API key. Pass { apiKey } to createClient() or set the MESSAGES_API_KEY environment variable.",
    );
  }

  const http = new HttpClient({
    apiKey,
    baseUrl: config.baseUrl ?? "https://api.messages.dev",
    timeout: config.timeout ?? 30_000,
    maxRetries: config.maxRetries ?? 2,
  });

  const client: MessagesClient = {
    async sendMessage(params: SendMessageParams) {
      return http.request("POST", "/v1/messages", {
        body: {
          from: params.from,
          to: params.to,
          ...(params.text !== undefined ? { text: params.text } : {}),
          ...(params.attachments ? { attachments: params.attachments } : {}),
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        },
        schema: OutboxItemSchema,
      });
    },

    async sendReaction(params: SendReactionParams) {
      return http.request("POST", "/v1/reactions", {
        body: { from: params.from, to: params.to, message_id: params.messageId, type: params.type },
        schema: OutboxItemSchema,
      });
    },

    async startTyping(params: TypingParams) {
      return http.request("POST", "/v1/typing", {
        body: { from: params.from, to: params.to },
        schema: OutboxItemSchema,
      });
    },

    async stopTyping(params: TypingParams) {
      return http.request("POST", "/v1/typing", {
        body: { from: params.from, to: params.to, state: "off" },
        schema: OutboxItemSchema,
      });
    },

    async sendReadReceipt(params: SendReadReceiptParams) {
      return http.request("POST", "/v1/receipts", {
        body: { from: params.from, to: params.to },
        schema: OutboxItemSchema,
      });
    },

    async uploadFile(params: UploadFileParams) {
      return http.requestRaw("POST", "/v1/files", {
        body: params.file,
        headers: {
          "Content-Type": params.mimeType ?? "application/octet-stream",
          ...(params.filename ? { "X-Filename": params.filename } : {}),
        },
        schema: FileSchema,
      });
    },

    async listLines() {
      const raw = await http.request("GET", "/v1/lines", {
        schema: ListResponseSchema(LineSchema),
      });
      return makePaginatedResponse(raw, async () => client.listLines());
    },

    async listChats(params: ListChatsParams) {
      const raw = await http.request("GET", "/v1/chats", {
        query: { from: params.from, limit: params.limit, cursor: params.cursor },
        schema: ListResponseSchema(ChatSchema),
      });
      return makePaginatedResponse(raw, async (cursor) =>
        client.listChats({ ...params, cursor }),
      );
    },

    async listMessages(params: ListMessagesParams) {
      const raw = await http.request("GET", "/v1/messages", {
        query: { from: params.from, to: params.to, limit: params.limit, cursor: params.cursor },
        schema: ListResponseSchema(MessageSchema),
      });
      return makePaginatedResponse(raw, async (cursor) =>
        client.listMessages({ ...params, cursor }),
      );
    },

    async listReactions(params: ListReactionsParams) {
      const raw = await http.request("GET", "/v1/reactions", {
        query: { message_id: params.messageId },
        schema: ListResponseSchema(ReactionSchema),
      });
      return makePaginatedResponse(raw, async () => client.listReactions(params));
    },

    async listTypingIndicators(params: ListTypingIndicatorsParams) {
      const raw = await http.request("GET", "/v1/typing", {
        query: { from: params.from, to: params.to },
        schema: ListResponseSchema(TypingIndicatorSchema),
      });
      return makePaginatedResponse(raw, async () => client.listTypingIndicators(params));
    },

    async listReadReceipts(params: ListReadReceiptsParams) {
      const raw = await http.request("GET", "/v1/receipts", {
        query: { from: params.from, to: params.to },
        schema: ListResponseSchema(ReadReceiptSchema),
      });
      return makePaginatedResponse(raw, async () => client.listReadReceipts(params));
    },

    async listWebhooks(params: ListWebhooksParams) {
      const raw = await http.request("GET", "/v1/webhooks", {
        query: { from: params.from },
        schema: ListResponseSchema(WebhookSchema),
      });
      return makePaginatedResponse(raw, async () => client.listWebhooks(params));
    },

    async getOutboxItem(params: { id: string }) {
      return http.request("GET", "/v1/outbox", {
        query: { id: params.id },
        schema: OutboxItemSchema,
      });
    },

    async getFileUrl(params: { id: string }) {
      const url = await http.getRedirectUrl("/v1/files", {
        query: { id: params.id },
      });
      return { url };
    },

    async createWebhook(params: CreateWebhookParams) {
      return http.request("POST", "/v1/webhooks", {
        body: { from: params.from, url: params.url, events: params.events },
        schema: WebhookSchema,
      });
    },

    async deleteWebhook(params: { id: string }) {
      return http.request("DELETE", "/v1/webhooks", {
        body: { id: params.id },
        schema: DeletedResponseSchema,
      });
    },
  };

  return client;
}
