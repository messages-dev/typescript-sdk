import { SignatureVerificationError } from "./errors.js";
import { WebhookEventSchema } from "./schemas.js";
import { transformKeys, snakeToCamel, camelToSnake } from "./util.js";
import type {
  WebhookEvent,
  WebhookEventName,
  WebhookEventDataFor,
} from "./types.js";

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
}

/**
 * Sign a webhook body the same way Messages.dev does:
 * `HMAC-SHA256(secret, "${timestamp}.${rawBody}")`, lowercase hex.
 *
 * Useful for testing: build a body, pick a timestamp, sign, then POST to your
 * own handler — `verifyWebhook` will accept it without any test-mode flag.
 */
export async function signWebhook(
  secret: string,
  timestamp: number,
  rawBody: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build a complete webhook delivery (body + headers) signed with `secret`.
 * Pass the result to `fetch(url, { method: "POST", body, headers })` for an
 * end-to-end local test loop. The data object can be camelCase (it's
 * converted to snake_case to match the wire format).
 */
export async function buildWebhookDelivery<E extends WebhookEventName>(
  event: E,
  data: WebhookEventDataFor<E>,
  secret: string,
  options?: { timestamp?: number; deliveryId?: string },
): Promise<{ body: string; headers: Record<string, string> }> {
  const timestamp = options?.timestamp ?? Date.now();
  const deliveryId =
    options?.deliveryId ??
    `dlv_${
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : Math.random().toString(16).slice(2)
    }`;
  const body = JSON.stringify({
    event,
    data: transformKeys(data as unknown, camelToSnake),
    timestamp,
    delivery_id: deliveryId,
  });
  const signature = await signWebhook(secret, timestamp, body);
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Signature": signature,
      "X-Webhook-Timestamp": String(timestamp),
      "X-Webhook-Delivery-Id": deliveryId,
    },
  };
}

export async function verifyWebhook(
  body: string | Uint8Array,
  signature: string | null | undefined,
  secret: string,
  options?: { tolerance?: number },
): Promise<WebhookEvent> {
  if (!signature) {
    throw new SignatureVerificationError("Missing webhook signature header");
  }

  const bodyStr = typeof body === "string" ? body : new TextDecoder().decode(body);

  // Parse the body to extract timestamp for signature computation
  const json = JSON.parse(bodyStr);
  const parsed = WebhookEventSchema.parse(json);
  const timestamp = parsed.timestamp;

  // Sign with timestamp prefix: HMAC(secret, "timestamp.body")
  const signedPayload = `${timestamp}.${bodyStr}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const sigBytes = new TextEncoder().encode(signature);
  const expectedBytes = new TextEncoder().encode(expected);

  if (!timingSafeEqual(sigBytes, expectedBytes)) {
    throw new SignatureVerificationError();
  }

  // Replay protection: reject if timestamp is too old
  const tolerance = options?.tolerance ?? 300_000; // 5 minutes default
  if (Math.abs(Date.now() - timestamp) > tolerance) {
    throw new SignatureVerificationError("Webhook timestamp too old");
  }

  return transformKeys(parsed, snakeToCamel) as unknown as WebhookEvent;
}
