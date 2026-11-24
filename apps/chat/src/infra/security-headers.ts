const BASE_CSP =
  "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; " +
  "img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'";

const EMBED_CSP =
  "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors *; " +
  "img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'";

export function isEmbedRequest(url: URL, allowEmbed: boolean): boolean {
  return allowEmbed && url.pathname === "/" && url.searchParams.get("embed") === "1";
}

export function securityHeaders(url: URL, allowEmbed: boolean): Record<string, string> {
  if (isEmbedRequest(url, allowEmbed)) {
    return {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": EMBED_CSP,
    };
  }

  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": BASE_CSP,
  };
}
