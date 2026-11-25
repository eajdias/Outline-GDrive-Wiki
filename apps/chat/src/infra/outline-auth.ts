import type { Logger } from "@repo/logger";
import type { AuthVerifier } from "../ports/auth.js";

const COOKIE_NAME = "accessToken";
const TIMEOUT_MS = 5_000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function accessTokenFrom(header: string | undefined): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== COOKIE_NAME) continue;

    const value = rest.join("=");
    return TOKEN_PATTERN.test(value) ? value : null;
  }
  return null;
}

export class OutlineSessionVerifier implements AuthVerifier {
  constructor(
    private readonly authUrl: string,
    private readonly logger: Logger,
  ) {}

  async verify(cookieHeader: string | undefined): Promise<boolean> {
    const token = accessTokenFrom(cookieHeader);
    if (!token) return false;

    try {
      const response = await fetch(`${this.authUrl}/api/auth.info`, {
        method: "POST",
        headers: { Cookie: `${COOKIE_NAME}=${token}` },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      await response.arrayBuffer();
      return response.ok;
    } catch (error) {
      this.logger.warn("outline session check failed", { error });
      return false;
    }
  }
}
