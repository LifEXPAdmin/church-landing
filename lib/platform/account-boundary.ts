import type { PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";
import {
  AccountError,
  changeAccountPassword,
  consumeAccountGrant,
  loginAccount,
  normalizeEmail,
  registerAccount,
  requestAccountGrant,
  SESSION_SECONDS
} from "./accounts";
import { accountConfig } from "./account-config";
import { deliverAccountGrant } from "./account-delivery";
import { allowAccountAttempt } from "./account-limits";

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
  return Response.json(
    { message, ...(redirect ? { redirect } : {}) },
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
  request: Request
): Promise<Response> {
  if (request.method !== "POST")
    return reply("Use the account form to continue.", 405, { Allow: "POST" });
  let config;
  try {
    config = accountConfig();
  } catch {
    return reply(
      "Account services are temporarily unavailable. Please try again later.",
      503
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
      "change-password",
      "request-reset",
      "request-verification",
      "consume-reset",
      "consume-verification"
    ].includes(operation)
  )
    return reply("Check the fields and try again.", 400);
  const recoveryRequest = operation.startsWith("request-");
  const started = Date.now();
  const accepted =
    "If this address is eligible, a link will be sent. Check your inbox and spam folder.";
  try {
    // Vercel overwrites x-real-ip. Outside that deployment, use a shared bucket, not an untrusted XFF.
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    const subject =
      normalizeEmail(body.email) ??
      (operation === "change-password"
        ? (requestSessionToken(request)?.slice(0, 43) ?? "anonymous")
        : "anonymous");
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
          503
        );
      if (allowed)
        await requestAccountGrant(
          db,
          body.email,
          operation === "request-reset" ? "RESET_PASSWORD" : "VERIFY_EMAIL",
          deliverAccountGrant
        );
      // The local sink has bounded latency. A future real sender must enqueue delivery and recheck timing.
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
        "Your request is complete. Try signing in with your details. If you already have an account, registration will not change it.",
        200
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
        503
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
        invalid:
          "Check every field. Passwords must match and contain 8 to 128 characters.",
        credentials:
          operation === "change-password"
            ? "Your current password did not match."
            : "That email and password did not match.",
        registration:
          "Your registration could not be completed. Try signing in or recovering your account.",
        session: "Please sign in again before changing your password.",
        grant:
          "This link is invalid, expired, or already used. Request a new link."
      };
      return reply(messages[error.code], 400);
    }
    // Avoid serializing errors that may contain SQL parameters, credential material, or contacts.
    return reply(
      "Account services are temporarily unavailable. Please try again later.",
      503
    );
  }
}
