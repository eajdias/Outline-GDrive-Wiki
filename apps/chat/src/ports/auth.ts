export interface AuthVerifier {
  verify(cookieHeader: string | undefined): Promise<boolean>;
}
