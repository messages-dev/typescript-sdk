import type { z } from "zod";
import { ErrorResponseSchema } from "./schemas.js";
import { errorFromResponse, MessagesError } from "./errors.js";
import { transformKeys, snakeToCamel, camelToSnake, type CamelCaseKeys } from "./util.js";

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout: number;
  maxRetries: number;
}

export class HttpClient {
  private config: HttpClientConfig;

  constructor(config: HttpClientConfig) {
    this.config = config;
  }

  async request<S extends z.ZodType>(
    method: string,
    path: string,
    opts?: {
      query?: Record<string, string | number | undefined>;
      body?: Record<string, unknown>;
      schema?: S;
    },
  ): Promise<CamelCaseKeys<z.infer<S>>> {
    const url = new URL(path, this.config.baseUrl);
    if (opts?.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
    const bodyStr = opts?.body
      ? JSON.stringify(transformKeys(opts.body, camelToSnake))
      : undefined;

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const res = await fetch(url.toString(), {
          method,
          headers,
          body: bodyStr,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (res.ok) {
          const json = await res.json();
          if (opts?.schema) {
            const parsed = opts.schema.parse(json);
            return transformKeys(parsed, snakeToCamel);
          }
          return transformKeys(json, snakeToCamel) as CamelCaseKeys<z.infer<S>>;
        }

        // Don't retry 4xx (except 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const json = await res.json().catch(() => null);
          const parsed = ErrorResponseSchema.safeParse(json);
          if (parsed.success) {
            throw errorFromResponse(res.status, parsed.data);
          }
          throw new MessagesError({
            type: "api_error",
            code: "unknown_error",
            message: `HTTP ${res.status}`,
            status: res.status,
            requestId: "",
          });
        }

        // Retry on 429 and 5xx
        lastError = new MessagesError({
          type: "api_error",
          code: res.status === 429 ? "rate_limit_exceeded" : "server_error",
          message: `HTTP ${res.status}`,
          status: res.status,
          requestId: "",
        });
      } catch (err) {
        if (err instanceof MessagesError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  async requestRaw<S extends z.ZodType>(
    method: string,
    path: string,
    opts: {
      query?: Record<string, string | number | undefined>;
      body: Blob | Uint8Array;
      headers?: Record<string, string>;
      schema?: S;
    },
  ): Promise<CamelCaseKeys<z.infer<S>>> {
    const url = new URL(path, this.config.baseUrl);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      ...opts.headers,
    };

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(500 * 2 ** (attempt - 1), 5000);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const res = await fetch(url.toString(), {
          method,
          headers,
          body: opts.body,
          signal: AbortSignal.timeout(this.config.timeout),
        });

        if (res.ok) {
          const json = await res.json();
          if (opts.schema) {
            const parsed = opts.schema.parse(json);
            return transformKeys(parsed, snakeToCamel);
          }
          return transformKeys(json, snakeToCamel) as CamelCaseKeys<z.infer<S>>;
        }

        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          const json = await res.json().catch(() => null);
          const parsed = ErrorResponseSchema.safeParse(json);
          if (parsed.success) {
            throw errorFromResponse(res.status, parsed.data);
          }
          throw new MessagesError({
            type: "api_error",
            code: "unknown_error",
            message: `HTTP ${res.status}`,
            status: res.status,
            requestId: "",
          });
        }

        lastError = new MessagesError({
          type: "api_error",
          code: res.status === 429 ? "rate_limit_exceeded" : "server_error",
          message: `HTTP ${res.status}`,
          status: res.status,
          requestId: "",
        });
      } catch (err) {
        if (err instanceof MessagesError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("Request failed");
  }

  async getRedirectUrl(
    path: string,
    opts: { query?: Record<string, string | number | undefined> },
  ): Promise<string> {
    const url = new URL(path, this.config.baseUrl);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      redirect: "manual",
      signal: AbortSignal.timeout(this.config.timeout),
    });

    if (res.status === 302) {
      const location = res.headers.get("Location");
      if (location) return location;
    }

    if (res.status >= 400 && res.status < 500) {
      const json = await res.json().catch(() => null);
      const parsed = ErrorResponseSchema.safeParse(json);
      if (parsed.success) {
        throw errorFromResponse(res.status, parsed.data);
      }
    }

    throw new MessagesError({
      type: "api_error",
      code: "unknown_error",
      message: `HTTP ${res.status}`,
      status: res.status,
      requestId: "",
    });
  }
}
