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
  SendContactCardParams,
  SendAudioMessageParams,
  ListChatsParams,
  ListMessagesParams,
  ListReactionsParams,
  ListTypingIndicatorsParams,
  ListReadReceiptsParams,
  ListWebhooksParams,
  CreateWebhookParams,
} from "./types.js";
import { buildVCard } from "./vcard.js";

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

    async sendAudioMessage(params: SendAudioMessageParams) {
      if (!params.audioMessage.startsWith("file_")) {
        throw new Error(
          `Invalid audioMessage: expected a file ID like "file_…". Upload audio first via client.uploadFile() or POST /v1/files.`,
        );
      }
      return http.request("POST", "/v1/audio-messages", {
        body: {
          from: params.from,
          to: params.to,
          audio_message: params.audioMessage,
          ...(params.replyTo ? { reply_to: params.replyTo } : {}),
        },
        schema: OutboxItemSchema,
      });
    },

    async sendContactCard(params: SendContactCardParams) {
      // The receiving Messages.app auto-renders any attachment with
      // `uti=public.vcard` / `mime_type=text/vcard` as a rich contact pill —
      // no special endpoint or balloon-plugin metadata is needed. We build
      // the .vcf, upload it, and send it as a regular attachment.
      let photoBytes: Uint8Array | undefined;
      if (params.photo) {
        if (!params.photo.startsWith("file_")) {
          throw new Error(
            `Invalid photo: expected a file ID like "file_…". Upload the photo first via client.uploadFile() or POST /v1/files.`,
          );
        }
        const photoUrl = await http.getRedirectUrl("/v1/files", {
          query: { id: params.photo },
        });
        const res = await fetch(photoUrl);
        if (!res.ok) {
          throw new Error(`Failed to fetch photo ${params.photo}: ${res.status}`);
        }
        photoBytes = new Uint8Array(await res.arrayBuffer());
      }
      const vcard = buildVCard({ ...params, photoBytes });
      const filename =
        params.filename ??
        `${params.firstName}-${params.lastName}.vcf`
          .toLowerCase()
          .replace(/\s+/g, "-");
      const file = await client.uploadFile({
        file: new Blob([vcard], { type: "text/vcard" }),
        filename,
        mimeType: "text/vcard",
      });
      return client.sendMessage({
        from: params.from,
        to: params.to,
        text: params.text,
        attachments: [file.id],
        replyTo: params.replyTo,
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
