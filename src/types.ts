import type { z } from "zod";
import type {
  LineSchema,
  ChatSchema,
  MessageSchema,
  AttachmentSchema,
  FileSchema,
  OutboxItemSchema,
  ReactionSchema,
  TypingIndicatorSchema,
  ReadReceiptSchema,
  WebhookSchema,
  DeletedResponseSchema,
  WebhookEventSchema,
} from "./schemas.js";
import type { CamelCaseKeys } from "./util.js";
import type { PaginatedResponse } from "./pagination.js";

// ── Resource types ──────────────────────────────────────────────────

export type Line = CamelCaseKeys<z.infer<typeof LineSchema>>;
export type Chat = CamelCaseKeys<z.infer<typeof ChatSchema>>;
export type Message = CamelCaseKeys<z.infer<typeof MessageSchema>>;
export type Attachment = CamelCaseKeys<z.infer<typeof AttachmentSchema>>;
export type File = CamelCaseKeys<z.infer<typeof FileSchema>>;
export type OutboxItem = CamelCaseKeys<z.infer<typeof OutboxItemSchema>>;
export type Reaction = CamelCaseKeys<z.infer<typeof ReactionSchema>>;
export type TypingIndicator = CamelCaseKeys<z.infer<typeof TypingIndicatorSchema>>;
export type ReadReceipt = CamelCaseKeys<z.infer<typeof ReadReceiptSchema>>;
export type Webhook = CamelCaseKeys<z.infer<typeof WebhookSchema>>;
export type DeletedResponse = CamelCaseKeys<z.infer<typeof DeletedResponseSchema>>;
export type WebhookEvent = CamelCaseKeys<z.infer<typeof WebhookEventSchema>>;

// ── Param types ─────────────────────────────────────────────────────

export interface SendMessageParams {
  from: string;
  /** Contact handle (e.g. +15551234567) or chat ID (e.g. cht_xxx) for group chats. */
  to: string;
  text?: string;
  attachments?: string[];
  /** Message ID or raw GUID to reply to. */
  replyTo?: string;
}

export interface SendReactionParams {
  from: string;
  to: string;
  messageId: string;
  type: string;
}

export interface TypingParams {
  from: string;
  to: string;
}

export interface SendReadReceiptParams {
  from: string;
  to: string;
}

export interface UploadFileParams {
  file: Blob | Buffer | Uint8Array;
  filename?: string;
  mimeType?: string;
}

export interface ContactPhone {
  value: string;
  /** e.g. "cell", "work", "home", "main", "fax". Default: "cell". */
  type?: string;
}

export interface ContactEmail {
  value: string;
  /** e.g. "work", "home". No default. */
  type?: string;
}

export interface ContactAddress {
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  /** e.g. "work", "home". No default. */
  type?: string;
}

export interface SendAudioMessageParams {
  from: string;
  to: string;
  /** File ID (`file_…`) of an audio file uploaded via `POST /v1/files`. */
  audioMessage: string;
  /** Message ID or raw GUID to reply to. */
  replyTo?: string;
}

export interface SendContactCardParams {
  from: string;
  to: string;
  /** Optional message text sent alongside the card. */
  text?: string;
  replyTo?: string;

  firstName: string;
  lastName: string;
  phones?: ContactPhone[];
  emails?: ContactEmail[];
  org?: string;
  title?: string;
  url?: string;
  address?: ContactAddress;
  /** ISO date, YYYY-MM-DD. */
  bday?: string;
  note?: string;
  /** File ID (`file_…`) of a photo uploaded via `POST /v1/files`. The SDK downloads it and embeds it inline in the vCard. */
  photo?: string;
  /** Override the photo mime type. Auto-detected from the file's bytes when omitted. */
  photoType?: "JPEG" | "PNG";

  /** Filename for the uploaded .vcf. Default: "<first>-<last>.vcf". */
  filename?: string;
}

export interface ListChatsParams {
  from: string;
  limit?: number;
  cursor?: string;
}

export interface ListMessagesParams {
  from: string;
  to: string;
  limit?: number;
  cursor?: string;
}

export interface ListReactionsParams {
  messageId: string;
}

export interface ListTypingIndicatorsParams {
  from: string;
  to: string;
}

export interface ListReadReceiptsParams {
  from: string;
  to: string;
}

export interface ListWebhooksParams {
  from: string;
}

export interface CreateWebhookParams {
  from: string;
  url: string;
  events: string[];
}

// ── Client config ───────────────────────────────────────────────────

export interface ClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

// ── Client interface ────────────────────────────────────────────────

export interface MessagesClient {
  sendMessage(params: SendMessageParams): Promise<OutboxItem>;
  sendReaction(params: SendReactionParams): Promise<OutboxItem>;
  startTyping(params: TypingParams): Promise<OutboxItem>;
  stopTyping(params: TypingParams): Promise<OutboxItem>;
  sendReadReceipt(params: SendReadReceiptParams): Promise<OutboxItem>;
  uploadFile(params: UploadFileParams): Promise<File>;
  sendContactCard(params: SendContactCardParams): Promise<OutboxItem>;
  sendAudioMessage(params: SendAudioMessageParams): Promise<OutboxItem>;

  listLines(): Promise<PaginatedResponse<Line>>;
  listChats(params: ListChatsParams): Promise<PaginatedResponse<Chat>>;
  listMessages(params: ListMessagesParams): Promise<PaginatedResponse<Message>>;
  listReactions(params: ListReactionsParams): Promise<PaginatedResponse<Reaction>>;
  listTypingIndicators(params: ListTypingIndicatorsParams): Promise<PaginatedResponse<TypingIndicator>>;
  listReadReceipts(params: ListReadReceiptsParams): Promise<PaginatedResponse<ReadReceipt>>;
  listWebhooks(params: ListWebhooksParams): Promise<PaginatedResponse<Webhook>>;

  getOutboxItem(params: { id: string }): Promise<OutboxItem>;
  getFileUrl(params: { id: string }): Promise<{ url: string }>;

  createWebhook(params: CreateWebhookParams): Promise<Webhook>;
  deleteWebhook(params: { id: string }): Promise<DeletedResponse>;
}
