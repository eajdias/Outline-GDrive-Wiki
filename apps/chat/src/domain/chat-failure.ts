export type ChatFailure = "rate_limit" | "unavailable" | "timeout" | "upstream";

export class ChatClientError extends Error {
  constructor(
    readonly failure: ChatFailure,
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = "ChatClientError";
  }
}
