import type { Logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RetryOptions {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

const DEFAULT_RETRY: RetryOptions = { attempts: 5, baseDelayMs: 1000, maxDelayMs: 16000 };
const DEFAULT_TIMEOUT_MS = 30_000;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

export class HttpClient {
  constructor(
    private readonly logger: Logger,
    private readonly retry: RetryOptions = DEFAULT_RETRY,
  ) {}

  private isRetryableStatus(method: string, status: number): boolean {
    if (status === 429 || status === 503) return true;
    return SAFE_METHODS.has(method) && (status === 500 || status === 502 || status === 504);
  }

  private backoff(attempt: number): number {
    return Math.min(this.retry.baseDelayMs * 2 ** (attempt - 1), this.retry.maxDelayMs);
  }

  private async exchange(
    method: string,
    url: string,
    options: RequestOptions,
    read: (response: Response) => Promise<string>,
  ): Promise<string> {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= this.retry.attempts; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

      try {
        const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
        const init: RequestInit = { method, headers, signal: controller.signal };
        if (options.body !== undefined) {
          headers["Content-Type"] = "application/json";
          init.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, init);
        const text = await read(response);

        if (response.ok) {
          return text;
        }

        if (this.isRetryableStatus(method, response.status) && attempt < this.retry.attempts) {
          const delay = Math.min(retryAfterMs(response) ?? this.backoff(attempt), this.retry.maxDelayMs);
          this.logger.warn("retryable response", { url, method, status: response.status, attempt, delayMs: delay });
          await sleep(delay);
          continue;
        }

        throw new HttpError(response.status, text, `${method} ${url} failed with ${response.status}`);
      } catch (error) {
        if (error instanceof HttpError) throw error;

        lastError = error;
        const canRetry = SAFE_METHODS.has(method) && attempt < this.retry.attempts;
        if (!canRetry) {
          throw new Error(
            `${method} ${url} failed before a response (${error instanceof Error ? error.message : String(error)}); ` +
              "not retried to avoid duplicating a non-idempotent write",
          );
        }

        const delay = this.backoff(attempt);
        this.logger.warn("network error", { url, method, attempt, delayMs: delay, error });
        await sleep(delay);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError instanceof Error ? lastError : new Error(`${method} ${url} failed`);
  }

  async request<T>(method: string, url: string, options: RequestOptions = {}): Promise<T> {
    const text = await this.exchange(method, url, options, (response) => response.text());
    if (text.length === 0) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new HttpError(200, text.slice(0, 200), `${method} ${url} returned a non-JSON body`);
    }
  }

  async requestText(method: string, url: string, options: RequestOptions = {}): Promise<string> {
    return this.exchange(method, url, options, (response) => response.text());
  }
}
