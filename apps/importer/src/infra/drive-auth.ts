import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { HttpError } from "@repo/http";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

const SCOPE =
  "https://www.googleapis.com/auth/drive.readonly " +
  "https://www.googleapis.com/auth/documents.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export class GoogleTokenProvider {
  private key: ServiceAccountKey | null = null;
  private token: string | null = null;
  private expiresAt = 0;

  constructor(private readonly keyPath: string) {}

  private async loadKey(): Promise<ServiceAccountKey> {
    if (this.key) return this.key;

    let raw: string;
    try {
      raw = await readFile(this.keyPath, "utf8");
    } catch (error) {
      throw new Error(`Cannot read Drive service account key at ${this.keyPath}: ${String(error)}`);
    }

    const parsed = JSON.parse(raw) as Partial<ServiceAccountKey>;
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error(`Drive service account key at ${this.keyPath} is missing client_email/private_key`);
    }
    this.key = { client_email: parsed.client_email, private_key: parsed.private_key };
    return this.key;
  }

  private async requestToken(): Promise<TokenResponse> {
    const key = await this.loadKey();
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = base64url(
      JSON.stringify({
        iss: key.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600,
      }),
    );
    const signature = base64url(
      createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.private_key),
    );
    const body = new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    });

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new HttpError(response.status, text.slice(0, 200), `Google token exchange failed with ${response.status}`);
    }
    return JSON.parse(text) as TokenResponse;
  }

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;

    const response = await this.requestToken();
    if (!response.access_token) {
      throw new Error("Google token exchange returned no access_token");
    }
    this.token = response.access_token;
    this.expiresAt = Date.now() + Math.max(0, (response.expires_in ?? 3600) - 60) * 1000;
    return this.token;
  }
}
