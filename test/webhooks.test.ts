import { test, expect } from "bun:test";
import {
  buildWebhookDelivery,
  signWebhook,
  verifyWebhook,
} from "../src/webhooks.js";
import { SignatureVerificationError } from "../src/errors.js";

const SECRET = "test_secret_123";

// Minimal valid `data` payloads for each event variant.
const messageData = {
  id: "msg_abc",
  line_id: "ln_abc",
  chat_id: "cht_abc",
  guid: "guid-abc",
  sender: "+15559876543",
  text: "hello",
  attachments: [],
  is_from_me: false,
  sent_at: 1_710_000_000_000,
  synced_at: 1_710_000_000_001,
  line_handle: "+15551234567",
};

const reactionData = {
  id: "rxn_abc",
  message_id: "msg_abc",
  chat_id: "cht_abc",
  type: "love",
  sender: "+15559876543",
  is_from_me: false,
  added: true,
  sent_at: 1_710_000_000_000,
  synced_at: 1_710_000_000_001,
  line_handle: "+15551234567",
};

test("verifyWebhook accepts a valid message.received delivery", async () => {
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp,
  });
  const signature = await signWebhook(SECRET, timestamp, body);
  const event = await verifyWebhook(body, signature, SECRET);

  expect(event.event).toBe("message.received");
  // Discriminated narrowing: TypeScript would let us read these without casts.
  if (event.event === "message.received") {
    expect(event.data.id).toBe("msg_abc");
    expect(event.data.lineHandle).toBe("+15551234567");
    expect(event.data.chatId).toBe("cht_abc");
  }
});

test("verifyWebhook accepts a delivery with delivery_id", async () => {
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: "message.sent",
    data: messageData,
    timestamp,
    delivery_id: "dlv_abc123",
  });
  const signature = await signWebhook(SECRET, timestamp, body);
  const event = await verifyWebhook(body, signature, SECRET);

  expect(event.event).toBe("message.sent");
  expect(event.deliveryId).toBe("dlv_abc123");
});

test("verifyWebhook narrows reaction.added with chat_id present", async () => {
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: "reaction.added",
    data: reactionData,
    timestamp,
  });
  const signature = await signWebhook(SECRET, timestamp, body);
  const event = await verifyWebhook(body, signature, SECRET);

  expect(event.event).toBe("reaction.added");
  if (event.event === "reaction.added") {
    expect(event.data.type).toBe("love");
    expect(event.data.added).toBe(true);
    expect(event.data.chatId).toBe("cht_abc");
    expect(event.data.lineHandle).toBe("+15551234567");
  }
});

test("verifyWebhook narrows reaction.removed", async () => {
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: "reaction.removed",
    data: { ...reactionData, added: false },
    timestamp,
  });
  const signature = await signWebhook(SECRET, timestamp, body);
  const event = await verifyWebhook(body, signature, SECRET);

  expect(event.event).toBe("reaction.removed");
  if (event.event === "reaction.removed") {
    expect(event.data.added).toBe(false);
  }
});

test("verifyWebhook throws on invalid signature", async () => {
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp: Date.now(),
  });
  await expect(verifyWebhook(body, "invalid_signature", SECRET)).rejects.toThrow(
    SignatureVerificationError,
  );
});

test("verifyWebhook throws on missing signature", async () => {
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp: Date.now(),
  });
  await expect(verifyWebhook(body, null, SECRET)).rejects.toThrow(
    SignatureVerificationError,
  );
});

test("verifyWebhook throws on tampered body", async () => {
  const timestamp = Date.now();
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp,
  });
  const signature = await signWebhook(SECRET, timestamp, body);
  const tampered = JSON.stringify({
    event: "message.received",
    data: { ...messageData, text: "tampered" },
    timestamp,
  });
  await expect(verifyWebhook(tampered, signature, SECRET)).rejects.toThrow(
    SignatureVerificationError,
  );
});

test("verifyWebhook throws on stale timestamp", async () => {
  const staleTimestamp = Date.now() - 400_000; // 6+ minutes ago
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp: staleTimestamp,
  });
  const signature = await signWebhook(SECRET, staleTimestamp, body);
  await expect(verifyWebhook(body, signature, SECRET)).rejects.toThrow(
    SignatureVerificationError,
  );
});

test("verifyWebhook accepts custom tolerance", async () => {
  const oldTimestamp = Date.now() - 200_000; // ~3 minutes ago
  const body = JSON.stringify({
    event: "message.received",
    data: messageData,
    timestamp: oldTimestamp,
  });
  const signature = await signWebhook(SECRET, oldTimestamp, body);
  // Default tolerance (5min) should accept this
  const event = await verifyWebhook(body, signature, SECRET);
  expect(event.event).toBe("message.received");

  // Strict tolerance (1min) should reject
  await expect(verifyWebhook(body, signature, SECRET, { tolerance: 60_000 })).rejects.toThrow(
    SignatureVerificationError,
  );
});

test("buildWebhookDelivery + verifyWebhook round-trips for every event", async () => {
  // camelCase data on the way in; the helper snake-cases it for the wire.
  const cases = [
    {
      event: "message.received" as const,
      data: {
        id: "msg_a",
        lineId: "ln_a",
        chatId: "cht_a",
        guid: "g-a",
        sender: "+15559876543",
        text: "hi",
        attachments: [],
        isFromMe: false,
        sentAt: 1,
        syncedAt: 2,
        lineHandle: "+15551234567",
      },
    },
    {
      event: "reaction.added" as const,
      data: {
        id: "rxn_a",
        messageId: "msg_a",
        chatId: "cht_a",
        type: "love",
        sender: "+15559876543",
        isFromMe: false,
        added: true,
        sentAt: 1,
        syncedAt: 2,
        lineHandle: "+15551234567",
      },
    },
  ];

  for (const c of cases) {
    const { body, headers } = await buildWebhookDelivery(c.event, c.data, SECRET);
    const event = await verifyWebhook(body, headers["X-Webhook-Signature"]!, SECRET);
    expect(event.event).toBe(c.event);
    expect(headers["X-Webhook-Delivery-Id"]).toMatch(/^dlv_/);
    expect(headers["X-Webhook-Timestamp"]).toBeDefined();
  }
});

test("buildWebhookDelivery accepts a fixed timestamp and deliveryId", async () => {
  const { headers, body } = await buildWebhookDelivery(
    "message.received",
    {
      id: "msg_a",
      lineId: "ln_a",
      chatId: "cht_a",
      guid: "g-a",
      sender: "+15559876543",
      attachments: [],
      isFromMe: false,
      sentAt: 1,
      syncedAt: 2,
      lineHandle: "+15551234567",
    },
    SECRET,
    { timestamp: 1_710_000_000_000, deliveryId: "dlv_fixed" },
  );
  expect(headers["X-Webhook-Timestamp"]).toBe("1710000000000");
  expect(headers["X-Webhook-Delivery-Id"]).toBe("dlv_fixed");
  const parsed = JSON.parse(body);
  expect(parsed.timestamp).toBe(1_710_000_000_000);
  expect(parsed.delivery_id).toBe("dlv_fixed");
  // snake_case wire format
  expect(parsed.data.line_handle).toBe("+15551234567");
});
