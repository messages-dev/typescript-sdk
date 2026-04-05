# The iMessage API for agents

Official TypeScript SDK for [messages.dev](https://messages.dev). Send and receive iMessage and SMS over a simple REST API from Node.js, Bun, Deno, or the browser.

## Installation

```bash
npm install @messages-dev/sdk
```

## Get an API key

1. Sign up at [app.messages.dev](https://app.messages.dev).
2. Go to **API Keys** and click **Create Key**. Copy the `sk_live_...` key, it's only shown once.
3. Go to the **Overview** tab, scan the sandbox QR code with your phone, and send the activation text. Your sandbox is now paired with your number and you have 50 free messages per day.

## Usage

```ts
import { createClient } from "@messages-dev/sdk";

const client = createClient();

await client.sendMessage({
  from: "+15551234567",
  to: "+15559876543",
  text: "Hello from the iMessage API!",
});
```

## What you can do

Send messages with attachments and reply threading:

```ts
await client.sendMessage({
  from,
  to,
  text,
  attachments: ["file_abc"],
  replyTo: "msg_xyz",
});
```

Send reactions, typing indicators, and read receipts:

```ts
await client.sendReaction({ from, to, messageId, type: "love" });
await client.startTyping({ from, to });
await client.sendReadReceipt({ from, to });
```

Upload files and attach them to messages:

```ts
const file = await client.uploadFile({
  from,
  file: buffer,
  filename: "photo.jpg",
  mimeType: "image/jpeg",
});

await client.sendMessage({
  from,
  to,
  text: "Look",
  attachments: [file.id],
});
```

## Receiving messages

Create a webhook from the **Webhooks** tab in your [dashboard](https://app.messages.dev/webhooks). Enter your endpoint URL, select the events you want to subscribe to, and copy the signing secret.

Verify incoming deliveries with `verifyWebhook`. Signatures use timing-safe HMAC-SHA256 and timestamps older than 5 minutes are rejected:

```ts
import { verifyWebhook } from "@messages-dev/sdk";

app.post("/webhooks", async (req, res) => {
  const event = await verifyWebhook(
    req.body,
    req.headers["x-webhook-signature"],
    process.env.WEBHOOK_SECRET,
  );

  if (event.event === "message.received") {
    console.log(`${event.data.sender}: ${event.data.text}`);
  }

  res.sendStatus(200);
});
```

## Error handling

All errors extend `MessagesError` with `code`, `param`, `status`, and `requestId`:

```ts
import { RateLimitError, InvalidRequestError } from "@messages-dev/sdk";

try {
  await client.sendMessage({ from, to, text });
} catch (err) {
  if (err instanceof RateLimitError) {
    // back off
  } else if (err instanceof InvalidRequestError) {
    console.error(err.code, err.param);
  }
}
```

## Configuration

```ts
createClient({
  apiKey: "sk_live_...",
  baseUrl: "https://api.messages.dev",
  timeout: 30_000,
  maxRetries: 2,
});
```

Retries use exponential backoff on 429 and 5xx responses. 4xx errors are returned immediately.

## TypeScript

Types ship with the package:

```ts
import type { Line, Chat, Message, Reaction, Webhook, WebhookEvent } from "@messages-dev/sdk";
```

Zod schemas (`MessageSchema`, `LineSchema`, etc.) are also exported.

## Links

- Documentation: [docs.messages.dev](https://docs.messages.dev)
- API reference: [docs.messages.dev/api-reference](https://docs.messages.dev/api-reference)
- Dashboard: [app.messages.dev](https://app.messages.dev)
- Issues: [github.com/messages-dev/sdk/issues](https://github.com/messages-dev/sdk/issues)

## License

[MIT](./LICENSE)
