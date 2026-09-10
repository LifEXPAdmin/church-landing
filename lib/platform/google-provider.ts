import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { OAuth2Client, CodeChallengeMethod } from "google-auth-library";
import { accountConfig } from "./account-config";
import { normalizeEmail } from "./accounts";
import { hashSessionToken, validToken } from "./auth";

export const GOOGLE_ISSUER = "https://accounts.google.com";
export class GoogleAccountError extends Error {
  constructor() {
    // Provider failures can contain codes, tokens and private identity details.
    super(
      "Google sign-in could not be completed. Try again or use email sign-in."
    );
  }
}
export type GoogleConfig = {
  clientId: string;
  clientSecret: string;
  callback: string;
};
export function googleConfig(
  env: NodeJS.ProcessEnv = process.env
): GoogleConfig | null {
  if (env.ACCOUNT_GOOGLE_ENABLED !== "true") return null;
  const account = accountConfig(env);
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  if (
    !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    clientSecret.length < 10
  )
    throw new GoogleAccountError();
  return {
    clientId,
    clientSecret,
    callback: account.origin + "/api/platform/google/callback"
  };
}

// The browser secret belongs in a short-lived HttpOnly cookie. Neither it nor
// the derived PKCE verifier is stored in the database or returned in UI data.
export function googleCodeVerifier(browserToken: string, state: string) {
  if (!validToken(browserToken) || !validToken(state))
    throw new GoogleAccountError();
  return createHmac("sha256", browserToken)
    .update("google-pkce:" + state)
    .digest("base64url");
}
export function googleAuthorizationUrl(
  config: GoogleConfig,
  state: string,
  nonce: string,
  browserToken: string
) {
  if (!validToken(nonce)) throw new GoogleAccountError();
  const client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.callback
  );
  const codeChallenge = createHash("sha256")
    .update(googleCodeVerifier(browserToken, state))
    .digest("base64url");
  return client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    response_type: "code",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
    prompt: "select_account"
  });
}

export type VerifiedGoogleIdentity = {
  issuer: typeof GOOGLE_ISSUER;
  subject: string;
  email: string;
  emailAuthoritative: boolean;
};

// This is a server boundary. The client parameter is an isolated-test seam;
// request bodies must never choose the verifier, audience, issuer or certificate.
export async function verifyGoogleIdToken(
  config: GoogleConfig,
  token: unknown,
  nonceHash: string,
  client = new OAuth2Client(
    config.clientId,
    config.clientSecret,
    config.callback
  )
): Promise<VerifiedGoogleIdentity> {
  try {
    if (
      typeof token !== "string" ||
      token.length > 16_384 ||
      !/^[a-f0-9]{64}$/.test(nonceHash)
    )
      throw new GoogleAccountError();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: config.clientId
    });
    const claim = ticket.getPayload();
    const email = normalizeEmail(claim?.email);
    const now = Math.floor(Date.now() / 1000);
    if (
      !claim ||
      !email ||
      claim.email_verified !== true ||
      ![GOOGLE_ISSUER, "accounts.google.com"].includes(claim.iss) ||
      claim.aud !== config.clientId ||
      (claim.azp && claim.azp !== config.clientId) ||
      !Number.isFinite(claim.exp) ||
      claim.exp <= now ||
      !Number.isFinite(claim.iat) ||
      claim.iat > now + 60 ||
      typeof claim.sub !== "string" ||
      !claim.sub ||
      claim.sub.length > 255 ||
      !validToken(claim.nonce) ||
      !timingSafeEqual(
        Buffer.from(hashSessionToken(claim.nonce), "hex"),
        Buffer.from(nonceHash, "hex")
      )
    )
      throw new GoogleAccountError();
    return {
      issuer: GOOGLE_ISSUER,
      subject: claim.sub,
      email,
      // Google's verified third-party email alone is not current ownership proof.
      emailAuthoritative:
        email.endsWith("@gmail.com") ||
        (typeof claim.hd === "string" &&
          claim.hd.length > 0 &&
          claim.hd.length <= 253)
    };
  } catch {
    throw new GoogleAccountError();
  }
}

export async function exchangeGoogleCode(
  config: GoogleConfig,
  code: string,
  verifier: string,
  nonceHash: string
) {
  try {
    if (!code || code.length > 2048) throw new GoogleAccountError();
    const client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.callback
    );
    const { tokens } = await client.getToken({
      code,
      codeVerifier: verifier,
      redirect_uri: config.callback
    });
    // No access/refresh/ID tokens are persisted or returned from this boundary.
    return await verifyGoogleIdToken(
      config,
      tokens.id_token,
      nonceHash,
      client
    );
  } catch {
    throw new GoogleAccountError();
  }
}
