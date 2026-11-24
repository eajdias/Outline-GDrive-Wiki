import type { AskUpstreamError } from "../usecases/ask.js";

export interface UpstreamResponse {
  status: number;
  error: string;
  message: string;
  headers?: Record<string, string>;
}

export function upstreamResponse(failure: AskUpstreamError["failure"]): UpstreamResponse {
  switch (failure) {
    case "rate_limit":
      return {
        status: 503,
        error: "upstream_rate_limited",
        message: "A IA está temporariamente sobrecarregada. Tente de novo em instantes.",
        headers: { "Retry-After": "30" },
      };
    case "unavailable":
      return {
        status: 503,
        error: "upstream_unavailable",
        message: "O serviço de IA está indisponível no momento. Tente de novo em instantes.",
      };
    case "timeout":
      return {
        status: 504,
        error: "timeout",
        message: "A resposta demorou mais que o limite. Tente uma pergunta mais específica.",
      };
    default:
      return {
        status: 502,
        error: "upstream_error",
        message: "A base de conhecimento respondeu com erro. Tente de novo.",
      };
  }
}
