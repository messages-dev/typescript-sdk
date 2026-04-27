import { z } from "zod";

export const LineSchema = z.object({
  id: z.string(),
  handle: z.string(),
  label: z.string().nullish(),
  service: z.enum(["imessage", "sms", "auto"]),
  is_active: z.boolean(),
});

export const ChatSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  identifier: z.string(),
  service: z.string(),
  name: z.string().nullish(),
  last_message_at: z.number().nullish(),
  is_group: z.boolean().nullish(),
  participants: z.array(z.string()).nullish(),
});

export const AttachmentSchema = z.object({
  filename: z.string().nullish(),
  mime_type: z.string().nullish(),
  size: z.number().nullish(),
  url: z.string().nullish(),
  /** Auto-generated transcription text for audio messages (voice memos). */
  transcription: z.string().nullish(),
});

export const FileSchema = z.object({
  id: z.string(),
  url: z.string().nullish(),
  filename: z.string().nullish(),
  mime_type: z.string(),
  size: z.number(),
  request_id: z.string(),
});

export const MessageSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  chat_id: z.string(),
  guid: z.string(),
  sender: z.string(),
  text: z.string().nullish(),
  attachments: z.array(AttachmentSchema),
  service: z.string().nullish(),
  is_from_me: z.boolean(),
  /** True when the message is a tap-to-record voice memo (vs. a generic audio attachment). */
  is_audio_message: z.boolean().nullish(),
  sent_at: z.number(),
  synced_at: z.number(),
  outbox_id: z.string().nullish(),
  reply_to_guid: z.string().nullish(),
});

export const OutboxItemSchema = z.object({
  id: z.string(),
  status: z.enum(["pending", "claimed", "sent", "failed"]),
  error: z.string().nullish(),
  created_at: z.number().optional(),
  completed_at: z.number().nullish(),
  request_id: z.string(),
});

export const ReactionSchema = z.object({
  id: z.string(),
  message_id: z.string(),
  type: z.string(),
  sender: z.string(),
  is_from_me: z.boolean(),
  added: z.boolean(),
  sent_at: z.number(),
  synced_at: z.number(),
});

export const TypingIndicatorSchema = z.object({
  id: z.string(),
  chat_id: z.string(),
  handle: z.string(),
  is_typing: z.boolean(),
  updated_at: z.number(),
});

export const ReadReceiptSchema = z.object({
  id: z.string(),
  chat_id: z.string(),
  handle: z.string(),
  last_read_at: z.number(),
  synced_at: z.number(),
});

export const WebhookSchema = z.object({
  id: z.string(),
  line_id: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  is_active: z.boolean(),
  secret: z.string().optional(),
});

export const ListResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable(),
    request_id: z.string(),
  });

export const ErrorResponseSchema = z.object({
  error: z.object({
    type: z.string(),
    code: z.string(),
    message: z.string(),
    param: z.string().optional(),
  }),
  request_id: z.string(),
});

export const DeletedResponseSchema = z.object({
  id: z.string(),
  deleted: z.literal(true),
  request_id: z.string(),
});

export const WebhookEventSchema = z.object({
  event: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.number(),
  delivery_id: z.string().optional(),
});
