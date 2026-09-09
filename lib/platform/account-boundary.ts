import type { PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  AccountError,
  changeAccountPassword,
  consumeAccountGrant,
  loginAccount,
  normalizeEmail,
  registerAccount,
  requestAccountGrant,
  updateAccountProfile,
  SESSION_SECONDS
} from "./accounts";
import { accountConfig } from "./account-config";
import { accountGrantDelivery } from "./account-delivery";
import { allowAccountAttempt } from "./account-limits";
import {
  listAccountSessions,
  revokeOtherAccountSessions
} from "./account-sessions";

export const SESSION_COOKIE = "church_platform_session";
export function sessionCookie(token: string, secure: boolean) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}
export function requestSessionToken(request: Request) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
function reply(
  message: string,
  status = 200,
  headers: Record<string, string> = {},
  redirect?: string
) {
  const code =
    headers["X-Account-Code"] ??
    (
      {
        400: "ACCOUNT_VALIDATION",
        401: "ACCOUNT_SESSION",
        403: "ACCOUNT_ORIGIN",
        405: "ACCOUNT_METHOD",
        409: "ACCOUNT_HANDLE_TAKEN",
        429: "ACCOUNT_LIMIT",
        503: "ACCOUNT_UNAVAILABLE"
      } as Record<number, string>
    )[status] ??
    "ACCOUNT_OK";
  return Response.json(
    { message, code, ...(redirect ? { redirect } : {}) },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        ...headers
      }
    }
  );
}
export async function readBody(
  request: Request
): Promise<Record<string, unknown>> {
  if (
    !request.headers.get("content-type")?.startsWith("application/json") ||
    !request.body
  )
    throw new AccountError("invalid");
  const reader = request.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 8192) {
      await reader.cancel();
      throw new AccountError("invalid");
    }
    chunks.push(value);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new AccountError("invalid");
  return parsed as Record<string, unknown>;
}

export async function handleAccountRequest(
  db: PrismaClient,
  request: Request,
  afterResponse?: (work: () => Promise<void>) => void
): Promise<Response> {
  const requestId = randomUUID();
  const response = await processAccountRequest(
    db,
    request,
    requestId,
    afterResponse
  );
  response.headers.set("X-Account-Request-Id", requestId);
  if (
    response.status === 503 &&
    !response.headers.has("X-Account-Delivery-Disabled")
  )
    console.error(
      JSON.stringify({
        event: "account_unavailable",
        requestId,
        code: response.headers.get("X-Account-Code") ?? "ACCOUNT_UNAVAILABLE"
      })
    );
  return response;
}

async function processAccountRequest(
  db: PrismaClient,
  request: Request,
  requestId: string,
  afterResponse?: (work: () => Promise<void>) => void
): Promise<Response> {
  if (request.method !== "POST")
    return reply("Use the account form to continue.", 405, { Allow: "POST" });
  let config;
  try {
    config = accountConfig();
  } catch {
    return reply(
      "Account services are temporarily unavailable. Please try again later.",
      503,
      { "X-Account-Code": "ACCOUNT_CONFIGURATION" }
    );
  }
  // The configured origin, never a forwarded Host supplied by a caller, is authoritative.
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return reply(
      "Please open the account form on this website and try again.",
      403
    );
  }
  let body;
  try {
    body = await readBody(request);
  } catch {
    return reply("Check the fields and try again.", 400);
  }
  const operation = body.operation;
  if (
    typeof operation !== "string" ||
    ![
      "register",
      "login",
      "update-profile",
      "change-password",
      "list-sessions",
      "revoke-other-sessions",
      "request-reset",
      "request-verification",
      "consume-reset",
      "consume-verification"
    ].includes(operation)
  )
    return reply("Check the fields and try again.", 400);
  const recoveryRequest = operation.startsWith("request-");
  const sessionOperation =
    operation === "list-sessions" || operation === "revoke-other-sessions";
  if (
    sessionOperation &&
    Object.keys(body).some(
      (key) =>
        key !== "operation" &&
        !(operation === "revoke-other-sessions" && key === "currentPassword")
    )
  )
    return reply(
      "Use the sign-in controls on your account settings page.",
      400
    );
  const started = Date.now();
  const accepted =
    "If this address is eligible, a link will be sent. Check your inbox and spam folder.";
  try {
    // Vercel overwrites x-real-ip. Outside that deployment, use a shared bucket, not an untrusted XFF.
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    const subject =
      operation === "change-password" ||
      operation === "update-profile" ||
      sessionOperation
        ? (requestSessionToken(request)?.slice(0, 43) ?? "anonymous")
        : (normalizeEmail(body.email) ?? "anonymous");
    const allowed = await allowAccountAttempt(
      db,
      config.rateSecret,
      operation,
      ip,
      subject
    );
    if (recoveryRequest) {
      if (config.delivery === "disabled")
        return reply(
          "Email recovery and verification are not available yet. Your account and posts are unchanged.",
          503,
          { "X-Account-Delivery-Disabled": "1" }
        );
      if (config.delivery === "resend" && !afterResponse)
        throw new Error("Account delivery requires response lifecycle support");
      if (allowed) {
        const email = normalizeEmail(body.email);
        const purpose =
          operation === "request-reset" ? "RESET_PASSWORD" : "VERIFY_EMAIL";
        const deliver = accountGrantDelivery(config);
        const work = async () => {
          try {
            await requestAccountGrant(db, email, purpose, deliver);
          } catch {
            console.error(
              JSON.stringify({ event: "account_delivery_failed", requestId })
            );
          }
        };
        // Account lookup and all vendor latency occur after the response. This is
        // a bounded lifecycle callback, not a durable queue or receipt guarantee.
        if (afterResponse) afterResponse(work);
        else await work(); // Isolated sink-only service tests.
      }
      await delay(Math.max(0, 500 - (Date.now() - started)));
      return reply(accepted);
    }
    if (!allowed)
      return reply(
        "Too many attempts. Please wait 15 minutes and try again.",
        429,
        { "Retry-After": "900" }
      );
    if (operation === "register") {
      await registerAccount(db, body);
      return reply(
        "Continue by signing in with your email and password. Registration never changes an existing account or resets its password.",
        200
      );
    }
    if (operation === "list-sessions") {
      const listing = await listAccountSessions(
        db,
        requestSessionToken(request)
      );
      return Response.json(
        { ...listing, message: "Active sign-ins loaded.", code: "ACCOUNT_OK" },
        {
          headers: {
            "Cache-Control": "no-store",
            "Referrer-Policy": "no-referrer"
          }
        }
      );
    }
    if (operation === "revoke-other-sessions") {
      await revokeOtherAccountSessions(
        db,
        requestSessionToken(request),
        body.currentPassword
      );
      return reply(
        "Other sign-ins have been removed. This sign-in stays active."
      );
    }
    if (operation === "login") {
      const token = await loginAccount(
        db,
        body.email,
        body.password,
        request.headers.get("user-agent")
      );
      return reply(
        "Signed in.",
        200,
        { "Set-Cookie": sessionCookie(token, config.secureCookie) },
        "/platform"
      );
    }
    if (operation === "update-profile") {
      const profile = await updateAccountProfile(
        db,
        requestSessionToken(request),
        body
      );
      return reply(
        "Profile saved.",
        200,
        {},
        `/platform/profile/${profile.username}`
      );
    }
    if (operation === "change-password") {
      await changeAccountPassword(
        db,
        requestSessionToken(request),
        body.currentPassword,
        body.password,
        body.confirmPassword
      );
      return reply(
        "Password changed. All devices are signed out. Sign in with your new password.",
        200,
        { "Set-Cookie": sessionCookie("", config.secureCookie) },
        "/platform/login?notice=password-changed"
      );
    }
    if (config.delivery === "disabled")
      return reply(
        "Email recovery and verification are not available yet.",
        503,
        { "X-Account-Delivery-Disabled": "1" }
      );
    await consumeAccountGrant(
      db,
      body.token,
      operation === "consume-reset" ? "RESET_PASSWORD" : "VERIFY_EMAIL",
      body.password,
      body.confirmPassword
    );
    if (operation === "consume-reset")
      return reply(
        "Password reset. All devices are signed out. Sign in with your new password.",
        200,
        { "Set-Cookie": sessionCookie("", config.secureCookie) },
        "/platform/login?notice=password-changed"
      );
    return reply("Email verified. You can return to your account.", 200);
  } catch (error) {
    if (error instanceof AccountError) {
      const messages = {
        "handle-invalid":
          "Choose a public username with 3 to 24 letters, numbers, or underscores. No spaces.",
        "handle-taken":
          "That public username is already taken. Choose another, or sign in if you already have an account.",
        profile:
          "Check your profile: name 2 to 100 characters, bio up to 500, location up to 80, a full http:// or https:// website up to 120, and at most 8 interests of 40 characters each.",
        invalid:
          "Check every field. Passwords must match and contain 8 to 128 characters.",
        credentials:
          operation === "change-password" ||
          operation === "revoke-other-sessions"
            ? "Your current password did not match."
            : "That email and password did not match.",
        registration:
          "Your registration could not be completed. Please try again later.",
        session: "Please sign in again before changing your account.",
        grant:
          "This link is invalid, expired, or already used. Request a new link."
      };
      return reply(
        messages[error.code],
        error.code === "handle-taken"
          ? 409
          : sessionOperation && error.code === "session"
            ? 401
            : 400
      );
    }
    // Avoid serializing errors that may contain SQL parameters, credential material, or contacts.
    return reply(
      "Account services are temporarily unavailable. Please try again later.",
      503
    );
  }
}
