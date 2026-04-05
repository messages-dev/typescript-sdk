import { SignatureVerificationError } from "./errors.js";
import { WebhookEventSchema } from "./schemas.js";
import { transformKeys, snakeToCamel } from "./util.js";
import type { WebhookEvent } from "./types.js";

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }
  return result === 0;
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

  return transformKeys(parsed, snakeToCamel) as WebhookEvent;
}
