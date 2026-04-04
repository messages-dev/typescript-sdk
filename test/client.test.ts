import { test, expect, afterEach } from "bun:test";
import { createClient } from "../src/client.js";
import {
  AuthenticationError,
  NotFoundError,
  RateLimitError,
} from "../src/errors.js";

const originalFetch = globalThis.fetch;

function mockFetch(handler: (req: Request) => Response | Promise<Response>) {
  globalThis.fetch = ((input: any, init?: any) => {
    const req = new Request(input as string, init);
    return handler(req);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("createClient throws if no API key", () => {
  const saved = process.env.MESSAGES_API_KEY;
  delete process.env.MESSAGES_API_KEY;
  expect(() => createClient()).toThrow("Missing API key");
  if (saved) process.env.MESSAGES_API_KEY = saved;
});

test("createClient reads API key from env", () => {
  process.env.MESSAGES_API_KEY = "sk_live_test123";
  const client = createClient();
  expect(client).toBeDefined();
  delete process.env.MESSAGES_API_KEY;
});

test("listLines sends correct request", async () => {
  mockFetch((req) => {
    expect(req.method).toBe("GET");
    expect(new URL(req.url).pathname).toBe("/v1/lines");
    expect(req.headers.get("Authorization")).toBe("Bearer sk_live_test");
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "ln_123",
            handle: "+15551234567",
            label: null,
            service: "imessage",
            is_active: true,
          },
        ],
        has_more: false,
        next_cursor: null,
        request_id: "req_abc",
      }),
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.listLines();
  expect(result.data).toHaveLength(1);
  expect(result.data[0]!.handle).toBe("+15551234567");
  expect(result.data[0]!.isActive).toBe(true);
  expect(result.hasMore).toBe(false);
  expect(result.requestId).toBe("req_abc");
});

test("sendMessage sends correct request", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/v1/messages");
    const body = (await req.json()) as any;
    expect(body.from).toBe("+15551234567");
    expect(body.to).toBe("+15559876543");
    expect(body.text).toBe("Hello!");
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.sendMessage({
    from: "+15551234567",
    to: "+15559876543",
    text: "Hello!",
  });
  expect(result.id).toBe("obx_123");
  expect(result.status).toBe("pending");
});

test("handles 401 authentication error", async () => {
  mockFetch(
    () =>
      new Response(
        JSON.stringify({
          error: {
            type: "authentication_error",
            code: "invalid_api_key",
            message: "Invalid API key.",
          },
          request_id: "req_err",
        }),
        { status: 401 },
      ),
  );

  const client = createClient({ apiKey: "sk_live_bad" });
  await expect(client.listLines()).rejects.toThrow(AuthenticationError);
});

test("handles 404 not found error", async () => {
  mockFetch(
    () =>
      new Response(
        JSON.stringify({
          error: {
            type: "not_found_error",
            code: "outbox_item_not_found",
            message: "Outbox item not found.",
          },
          request_id: "req_err",
        }),
        { status: 404 },
      ),
  );

  const client = createClient({ apiKey: "sk_live_test" });
  await expect(client.getOutboxItem({ id: "obx_bad" })).rejects.toThrow(
    NotFoundError,
  );
});

test("retries on 5xx", async () => {
  let attempts = 0;
  mockFetch(() => {
    attempts++;
    if (attempts < 3) {
      return new Response("Server Error", { status: 500 });
    }
    return new Response(
      JSON.stringify({
        data: [],
        has_more: false,
        next_cursor: null,
        request_id: "req_ok",
      }),
    );
  });

  const client = createClient({ apiKey: "sk_live_test", maxRetries: 2 });
  const result = await client.listLines();
  expect(result.data).toHaveLength(0);
  expect(attempts).toBe(3);
});

test("deleteWebhook sends body with DELETE", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("DELETE");
    const body = (await req.json()) as any;
    expect(body.id).toBe("wh_abc123");
    return new Response(
      JSON.stringify({
        id: "wh_abc123",
        deleted: true,
        request_id: "req_del",
      }),
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.deleteWebhook({ id: "wh_abc123" });
  expect(result.deleted).toBe(true);
});

test("sendReaction sends message_id in body", async () => {
  mockFetch(async (req) => {
    const body = (await req.json()) as any;
    expect(body.from).toBe("+15551234567");
    expect(body.message_id).toBe("msg_abc123");
    expect(body.type).toBe("love");
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  await client.sendReaction({
    from: "+15551234567",
    to: "+15559876543",
    messageId: "msg_abc123",
    type: "love",
  });
});

test("uploadFile sends raw binary POST", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/v1/files");
    expect(req.headers.get("Content-Type")).toBe("image/jpeg");
    expect(req.headers.get("X-Filename")).toBe("photo.jpg");
    const body = await req.arrayBuffer();
    expect(body.byteLength).toBe(4);
    return new Response(
      JSON.stringify({
        id: "file_abc123",
        url: "https://storage.example.com/file.jpg",
        filename: "photo.jpg",
        mime_type: "image/jpeg",
        size: 4,
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.uploadFile({
    file: new Uint8Array([1, 2, 3, 4]),
    filename: "photo.jpg",
    mimeType: "image/jpeg",
  });
  expect(result.id).toBe("file_abc123");
  expect(result.url).toBe("https://storage.example.com/file.jpg");
  expect(result.filename).toBe("photo.jpg");
  expect(result.mimeType).toBe("image/jpeg");
  expect(result.size).toBe(4);
});

test("getFileUrl follows redirect", async () => {
  mockFetch((req) => {
    expect(req.method).toBe("GET");
    expect(new URL(req.url).searchParams.get("id")).toBe("file_abc123");
    return new Response(null, {
      status: 302,
      headers: { Location: "https://storage.example.com/file.jpg" },
    });
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.getFileUrl({ id: "file_abc123" });
  expect(result.url).toBe("https://storage.example.com/file.jpg");
});

test("sendMessage with attachments", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    const body = (await req.json()) as any;
    expect(body.to).toBe("+15559876543");
    expect(body.text).toBe("Check this out!");
    expect(body.attachments).toEqual(["file_abc123"]);
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.sendMessage({
    from: "+15551234567",
    to: "+15559876543",
    text: "Check this out!",
    attachments: ["file_abc123"],
  });
  expect(result.id).toBe("obx_123");
  expect(result.status).toBe("pending");
});

test("sendMessage with only attachments (no text)", async () => {
  mockFetch(async (req) => {
    const body = (await req.json()) as any;
    expect(body.to).toBe("+15559876543");
    expect(body.text).toBeUndefined();
    expect(body.attachments).toEqual(["file_abc123"]);
    return new Response(
      JSON.stringify({
        id: "obx_456",
        status: "pending",
        request_id: "req_def",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.sendMessage({
    from: "+15551234567",
    to: "+15559876543",
    attachments: ["file_abc123"],
  });
  expect(result.id).toBe("obx_456");
});

test("listChats sends correct request", async () => {
  mockFetch((req) => {
    expect(req.method).toBe("GET");
    expect(new URL(req.url).pathname).toBe("/v1/chats");
    expect(new URL(req.url).searchParams.get("from")).toBe("+15551234567");
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "cht_123",
            line_id: "ln_123",
            identifier: "+15559876543",
            service: "iMessage",
            name: null,
            last_message_at: 1234567890,
          },
        ],
        has_more: false,
        next_cursor: null,
        request_id: "req_abc",
      }),
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.listChats({ from: "+15551234567" });
  expect(result.data).toHaveLength(1);
  expect(result.data[0]!.identifier).toBe("+15559876543");
  expect(result.data[0]!.lastMessageAt).toBe(1234567890);
});

test("pagination with for await...of", async () => {
  let page = 0;
  mockFetch((req) => {
    page++;
    if (page === 1) {
      return new Response(
        JSON.stringify({
          data: [
            {
              id: "ln_1",
              handle: "+1",
              label: null,
              service: "imessage",
              is_active: true,
            },
          ],
          has_more: true,
          next_cursor: "cursor_1",
          request_id: "req_1",
        }),
      );
    }
    return new Response(
      JSON.stringify({
        data: [
          {
            id: "ln_2",
            handle: "+2",
            label: null,
            service: "imessage",
            is_active: true,
          },
        ],
        has_more: false,
        next_cursor: null,
        request_id: "req_2",
      }),
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const lines = await client.listLines();
  const collected: string[] = [];
  for await (const line of lines) {
    collected.push(line.handle);
  }
  expect(collected).toEqual(["+1", "+2"]);
});

test("startTyping sends correct request", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/v1/typing");
    const body = (await req.json()) as any;
    expect(body.from).toBe("+15551234567");
    expect(body.to).toBe("+15559876543");
    expect(body.state).toBeUndefined();
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  await client.startTyping({ from: "+15551234567", to: "+15559876543" });
});

test("stopTyping sends state off", async () => {
  mockFetch(async (req) => {
    const body = (await req.json()) as any;
    expect(body.state).toBe("off");
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  await client.stopTyping({ from: "+15551234567", to: "+15559876543" });
});

test("sendReadReceipt sends correct request", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/v1/receipts");
    const body = (await req.json()) as any;
    expect(body.from).toBe("+15551234567");
    expect(body.to).toBe("+15559876543");
    return new Response(
      JSON.stringify({
        id: "obx_123",
        status: "pending",
        request_id: "req_abc",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  await client.sendReadReceipt({ from: "+15551234567", to: "+15559876543" });
});

test("createWebhook sends correct request", async () => {
  mockFetch(async (req) => {
    expect(req.method).toBe("POST");
    expect(new URL(req.url).pathname).toBe("/v1/webhooks");
    const body = (await req.json()) as any;
    expect(body.from).toBe("+15551234567");
    expect(body.url).toBe("https://example.com/hook");
    expect(body.events).toEqual(["message.received"]);
    return new Response(
      JSON.stringify({
        id: "wh_123",
        line_id: "ln_123",
        url: "https://example.com/hook",
        events: ["message.received"],
        is_active: true,
        secret: "whsec_123",
      }),
      { status: 201 },
    );
  });

  const client = createClient({ apiKey: "sk_live_test" });
  const result = await client.createWebhook({
    from: "+15551234567",
    url: "https://example.com/hook",
    events: ["message.received"],
  });
  expect(result.id).toBe("wh_123");
  expect(result.isActive).toBe(true);
  expect(result.secret).toBe("whsec_123");
});
