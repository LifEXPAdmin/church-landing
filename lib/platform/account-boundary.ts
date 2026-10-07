import { scheduleFounderWelcome } from "./founder-welcome-queue";
import { signupCompletionCookie } from "./signup-completion";
import type { PrismaClient } from "@prisma/client";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import {
  changeAccountPassword,
  consumeAccountGrant,
  loginAccount,
  normalizeEmail,
  registerAccount,
  requestAccountGrant,
  updateAccountProfile,
  SESSION_SECONDS
} from "./accounts";
import { AccountError } from "./account-error";
import { accountConfig } from "./account-config";
import { accountGrantDelivery } from "./account-delivery";
import { allowAccountAttempt } from "./account-limits";
import {
  revokeReplacedAccountSession,
  listAccountSessions,
  revokeOtherAccountSessions
} from "./account-sessions";
import {
  AccountExportError,
  prepareAccountExport,
  downloadAccountExport
} from "./account-export";
import {
  AccountLifecycleError,
  deactivateAccount,
  reactivateAccount
} from "./account-lifecycle";
import {
  AccountEmailChangeError,
  requestEmailChange,
  confirmEmailChange
} from "./account-email-change";
import { safeAccountReturn } from "./account-entry";
import { googleConfig } from "./google-provider";
import {
  requestAccountCredential,
  googleRequestToken,
  googleCookie,
  clearGoogleCookies
} from "./google-cookies";
import { isRecentAuthenticationPurpose } from "./account-credential";
import { accountDeletionAvailable } from "./account-availability";
import {
  requestPermanentAccountDeletion,
  readAccountDeletionProgress,
  type AccountDeletionJournal
} from "./account-deletion";
import { protectedAccountDeletionJournal } from "./account-deletion-journal";
import { protectDiscoveryRecovery } from "./discovery-recovery";
import { readAccountSession } from "./accounts";
import {
  ACCOUNT_SESSION_COOKIE,
  ACCOUNT_SECURE_SESSION_COOKIE,
  accountSessionCookie,
  sessionCookieName
} from "./account-cookies";

export const SESSION_COOKIE = ACCOUNT_SESSION_COOKIE;
export function sessionCookie(token: string, secure: boolean) {
  return `${sessionCookieName(secure)}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_SECONDS : 0}${secure ? "; Secure" : ""}`;
}
export function withSessionCookie(
  response: Response,
  token: string,
  secure: boolean
) {
  response.headers.append("Set-Cookie", sessionCookie(token, secure));
  if (secure)
    response.headers.append(
      "Set-Cookie",
      `${sessionCookie("", false)}; Secure`
    );
  return response;
}
export function requestSessionToken(request: Request) {
  return accountSessionCookie(request.headers.get("cookie"));
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
  request: Request,
  maximumBytes = 8192,
  bodyMaximum?: (body: Record<string, unknown>) => number
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
    if (length > maximumBytes) {
      await reader.cancel();
      throw new AccountError("invalid");
    }
    chunks.push(value);
  }
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new AccountError("invalid");
  if (bodyMaximum && length > bodyMaximum(parsed as Record<string, unknown>))
    throw new AccountError("invalid");
  return parsed as Record<string, unknown>;
}

export async function handleAccountRequest(
  db: PrismaClient,
  request: Request,
  afterResponse?: (work: () => Promise<void>) => void,
  deletionJournal?: AccountDeletionJournal
): Promise<Response> {
  const requestId = randomUUID();
  const credentialUse = { google: false, sessionRevoked: false };
  const response = await processAccountRequest(
    db,
    request,
    requestId,
    afterResponse,
    credentialUse,
    deletionJournal
  );
  if (response.ok && !credentialUse.sessionRevoked) {
    const sessionCookies = response.headers.getSetCookie();
    const primary =
      sessionCookies.find((cookie) =>
        cookie.startsWith(ACCOUNT_SECURE_SESSION_COOKIE + "=")
      ) ??
      sessionCookies.find((cookie) =>
        cookie.startsWith(ACCOUNT_SESSION_COOKIE + "=")
      );
    const sessionEnded =
      primary?.startsWith(`${ACCOUNT_SECURE_SESSION_COOKIE}=;`) ||
      primary?.startsWith(`${ACCOUNT_SESSION_COOKIE}=;`);
    if (credentialUse.google || sessionEnded) {
      const secure = accountConfig().secureCookie;
      if (sessionEnded) clearGoogleCookies(response, secure);
      else
        response.headers.append(
          "Set-Cookie",
          googleCookie("recent", "", secure)
        );
    }
  }
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
  afterResponse?: (work: () => Promise<void>) => void,
  credentialUse = { google: false, sessionRevoked: false },
  deletionJournal?: AccountDeletionJournal
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
    body = await readBody(request, 32768, (input) =>
      input.operation === "update-profile" ? 32768 : 8192
    );
  } catch {
    return reply("Check the fields and try again.", 400);
  }
  const operation = body.operation;
  // Google proofs come only from HttpOnly cookies, never password-field objects.
  if (
    body.currentPassword !== undefined &&
    typeof body.currentPassword !== "string"
  )
    return reply("Check the fields and try again.", 400);
  if (
    (body.credentialMethod !== undefined &&
      body.credentialMethod !== "google") ||
    (body.credentialMethod === "google" &&
      (body.currentPassword !== undefined ||
        !isRecentAuthenticationPurpose(operation)))
  )
    return reply("Check the fields and try again.", 400);
  if (
    typeof operation !== "string" ||
    ![
      "register",
      "login",
      "update-profile",
      "change-password",
      "list-sessions",
      "revoke-other-sessions",
      "prepare-export",
      "download-export",
      "deactivate-account",
      "delete-account",
      "deletion-progress",
      "reactivate-account",
      "request-email-change",
      "confirm-email-change",
      "request-reset",
      "request-verification",
      "consume-reset",
      "consume-verification"
    ].includes(operation)
  )
    return reply("Check the fields and try again.", 400);
  const recoveryRequest =
    operation === "request-reset" || operation === "request-verification";
  const sessionFields: Record<string, string[]> = {
    "list-sessions": [],
    "revoke-other-sessions": ["currentPassword"],
    "prepare-export": ["currentPassword"],
    "download-export": ["authorization"],
    "deactivate-account": ["currentPassword", "confirmed"],
    "delete-account": ["currentPassword", "confirmed", "proof", "ownerId"],
    "deletion-progress": ["proof"],
    "request-email-change": ["currentPassword", "newEmail"],
    "confirm-email-change": ["currentPassword", "token"]
  };
  const sessionOperation = Object.hasOwn(sessionFields, operation);
  if (
    sessionOperation &&
    Object.keys(body).some(
      (key) =>
        key !== "operation" &&
        !(
          key === "credentialMethod" && isRecentAuthenticationPurpose(operation)
        ) &&
        !sessionFields[operation].includes(key)
    )
  )
    return reply("Use the controls on your account settings page.", 400);
  if (
    operation === "reactivate-account" &&
    Object.keys(body).some(
      (key) => !["operation", "email", "password", "confirmed"].includes(key)
    )
  )
    return reply("Use the account reactivation form.", 400);
  const started = Date.now();
  const accepted =
    "If this address is eligible, a link will be sent. Check your inbox and spam folder.";
  try {
    if (body.credentialMethod === "google" && !googleConfig())
      return reply("Google account confirmation is not available yet.", 503);
    credentialUse.google = body.credentialMethod === "google";
    const credential = requestAccountCredential(
      request,
      body,
      config.secureCookie
    );
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
    if (
      operation === "request-email-change" ||
      operation === "confirm-email-change"
    ) {
      if (config.delivery === "disabled")
        return reply(
          "Sign-in email changes are not available until email delivery is ready. Your existing sign-in email is unchanged.",
          503,
          { "X-Account-Delivery-Disabled": "1" }
        );
      if (operation === "request-email-change") {
        if (config.delivery === "resend" && !afterResponse)
          throw new Error(
            "Account delivery requires response lifecycle support"
          );
        const send = await requestEmailChange(
          db,
          requestSessionToken(request),
          credential,
          body.newEmail,
          accountGrantDelivery(config),
          request.headers.get("X-Expected-Account")
        );
        const work = async () => {
          try {
            await send();
          } catch {
            console.error(
              JSON.stringify({ event: "account_delivery_failed", requestId })
            );
          }
        };
        if (afterResponse) afterResponse(work);
        else await work();
        await delay(Math.max(0, 500 - (Date.now() - started)));
        return reply(
          "If this address can be used, a confirmation link will be sent. Your existing sign-in email keeps working until you confirm. Check your inbox and spam folder."
        );
      }
      await confirmEmailChange(
        db,
        requestSessionToken(request),
        credential,
        body.token ?? googleRequestToken(request, "email", config.secureCookie),
        request.headers.get("X-Expected-Account")
      );
      credentialUse.sessionRevoked = true;
      return reply(
        "Sign-in email changed. All devices are signed out. Sign in again using your new email and password or your linked Google account.",
        200,
        // Access was revoked transactionally. A delayed response must not
        // clear a newer login cookie established after that transaction.
        {},
        "/platform/login?notice=email-changed"
      );
    }
    if (operation === "register") {
      const created = await registerAccount(db, body);
      // Only a new insert can trigger signup mail. Duplicate registration must
      // neither overwrite an account nor send unsolicited verification mail.
      if (created && config.delivery !== "disabled") {
        const work = async () => {
          try {
            await requestAccountGrant(
              db,
              created.email,
              "VERIFY_EMAIL",
              accountGrantDelivery(config)
            );
          } catch {
            console.error(
              JSON.stringify({ event: "account_delivery_failed", requestId })
            );
          }
        };
        if (afterResponse) afterResponse(work);
        else if (config.delivery === "test-sink") await work();
      }
      return reply(
        config.delivery === "disabled"
          ? "Continue by signing in with your email and password. Registration never changes an existing account or resets its password."
          : "Continue by signing in with your email and password. If this is a new account, a verification email will be sent. Check your inbox and spam folder.",
        200,
        {
          "Set-Cookie": signupCompletionCookie(
            created?.id,
            config.rateSecret,
            config.secureCookie
          )
        }
      );
    }
    if (operation === "delete-account" || operation === "deletion-progress") {
      if (operation === "delete-account" && !accountDeletionAvailable())
        return reply(
          "Permanent account deletion is not available yet. No request was accepted.",
          503
        );
      if (operation === "delete-account" && typeof body.ownerId !== "string")
        return reply("Reload your account settings before continuing.", 400);
      const result =
        operation === "deletion-progress"
          ? await readAccountDeletionProgress(db, body.proof)
          : await requestPermanentAccountDeletion(
              db,
              requestSessionToken(request),
              credential,
              body.confirmed,
              body.proof,
              deletionJournal ?? protectedAccountDeletionJournal(),
              body.ownerId
            );
      const response = Response.json(result, {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer"
        }
      });
      return operation === "delete-account"
        ? withSessionCookie(response, "", config.secureCookie)
        : response;
    }
    if (operation === "deactivate-account") {
      await deactivateAccount(
        db,
        requestSessionToken(request),
        credential,
        body.confirmed,
        request.headers.get("X-Expected-Account") ?? ""
      );
      // Server-side revocation is authoritative. A delayed reply must not
      // clear a replacement login or its Google confirmation cookies.
      credentialUse.sessionRevoked = true;
      return reply(
        "Account deactivated. All devices are signed out.",
        200,
        {},
        "/platform/account/reactivate?notice=deactivated"
      );
    }
    if (operation === "reactivate-account") {
      await reactivateAccount(db, body.email, body.password, body.confirmed);
      return reply(
        "Your account is active. Sign in to continue. Review your directory sharing before opting in again.",
        200,
        {},
        "/platform/login?notice=reactivated"
      );
    }
    if (operation === "list-sessions") {
      const listing = await listAccountSessions(
        db,
        requestSessionToken(request),
        request.headers.get("x-expected-account")
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
    if (operation === "prepare-export") {
      const prepared = await prepareAccountExport(
        db,
        requestSessionToken(request),
        credential,
        config.rateSecret
      );
      return Response.json(prepared, {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer"
        }
      });
    }
    if (operation === "download-export") {
      const content = await downloadAccountExport(
        db,
        requestSessionToken(request),
        body.authorization,
        config.rateSecret
      );
      return new Response(content, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="godschurches-account.json"',
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }
    if (operation === "revoke-other-sessions") {
      await revokeOtherAccountSessions(
        db,
        requestSessionToken(request),
        credential,
        request.headers.get("x-expected-account")
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
      await revokeReplacedAccountSession(
        db,
        requestSessionToken(request),
        token
      );
      scheduleFounderWelcome(db, token, afterResponse);
      return withSessionCookie(
        reply("Signed in.", 200, {}, safeAccountReturn(body.next)),
        token,
        config.secureCookie
      );
    }
    if (operation === "update-profile") {
      const token = requestSessionToken(request);
      const profile = await updateAccountProfile(
        db,
        token,
        body,
        request.headers.get("x-expected-account")
      );
      const owner = await readAccountSession(db, token);
      if (!owner) throw new AccountError("session");
      if (!(await protectDiscoveryRecovery(db, owner.id, request.signal)))
        return reply(
          "Your profile is saved. Protected recovery is pending and will be retried automatically. Review your saved profile before making another change.",
          202
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
        credential,
        body.password,
        body.confirmPassword,
        request.headers.get("X-Expected-Account")
      );
      credentialUse.sessionRevoked = true;
      return reply(
        "Password changed. All devices are signed out. Sign in with your new password.",
        200,
        // Keep an unrelated newer login intact if this response is delayed.
        // The old token no longer names an active server-side session.
        {},
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
      return withSessionCookie(
        reply(
          "Password reset. All devices are signed out. Sign in with your new password.",
          200,
          {},
          "/platform/login?notice=password-changed"
        ),
        "",
        config.secureCookie
      );
    scheduleFounderWelcome(db, requestSessionToken(request), afterResponse);
    return reply("Email verified. You can return to your account.", 200);
  } catch (error) {
    if (error instanceof AccountEmailChangeError)
      return reply(error.message, 400);
    if (error instanceof AccountLifecycleError)
      return reply(
        error.code === "handoff"
          ? "Transfer or archive your active topics and Gather groups, and hand off church, contact, operator or support duties before deactivating. An administrator must remove your assignments and transfer any case or intake ownership first. Your account is unchanged."
          : "Confirm that you understand the account change before continuing.",
        error.code === "handoff" ? 409 : 400,
        {
          "X-Account-Code":
            error.code === "handoff"
              ? "ACCOUNT_HANDOFF"
              : "ACCOUNT_CONFIRMATION"
        }
      );
    if (error instanceof AccountExportError)
      return reply(
        error.code === "size"
          ? "Your data exceeds this download's current size limit. No file was created and no partial export was returned."
          : "This download authorization is invalid or expired. Confirm your account and try again.",
        400
      );
    if (error instanceof AccountError) {
      const messages = {
        "password-unsafe":
          "Choose a more unique password. Avoid common passwords or versions of your name, username, email or God's Churches. A password manager can help.",
        "profile-event":
          "Your selected event is no longer available to add. Check its current access or remove the selection, then save again. Your other edits are still here.",
        "profile-featured":
          "A new featured resource is unavailable to add. Check its current access or remove the selection, then save again. Adding resources requires a verified adult account. Your other edits are still here.",
        "profile-disclosure":
          "Choose Only me for your location. Sharing with members requires a verified email and confirmed adult eligibility.",
        "profile-conflict":
          "Your profile changed in another tab. Your edits are still here. Review the saved profile before trying again.",
        "handle-invalid":
          "Choose a public username with 3 to 24 letters, numbers, or underscores. No spaces.",
        "handle-taken":
          "That public username is already taken. Choose another, or sign in if you already have an account.",
        profile:
          "Check your profile: name 2 to 100 characters, bio up to 500, location up to 80, a full http:// or https:// website up to 120, and at most 8 interests of 40 characters each. Choose an available appearance preset and keep your introduction within 1,000 characters. Optional sections allow a testimony of 2,000 characters, 10 distinct skills of 60 characters each, and 3 http or https links with labels up to 80 characters and addresses up to 500 characters. Each link needs both a label and address.",
        invalid:
          "Check every field. Passwords must match and contain 8 to 128 characters.",
        credentials:
          operation === "deletion-progress"
            ? "This deletion progress reference is unavailable or expired."
            : operation === "delete-account"
              ? "Verify your account email and confirm your current sign-in before deleting your account."
              : operation === "change-password" ||
                  operation === "prepare-export" ||
                  operation === "deactivate-account" ||
                  operation === "request-email-change" ||
                  operation === "confirm-email-change" ||
                  operation === "revoke-other-sessions"
                ? credentialUse.google
                  ? "Google confirmation is missing, expired or already used. Confirm this action with Google again."
                  : "Your current password did not match."
                : "That email and password did not match.",
        registration:
          "Your registration could not be completed. Please try again later.",
        session: "Please sign in again before changing your account.",
        grant:
          "This link is invalid, expired, or already used. Request a new link."
      };
      return reply(
        messages[error.code],
        error.code === "handle-taken" || error.code === "profile-conflict"
          ? 409
          : sessionOperation && error.code === "session"
            ? 401
            : 400,
        error.code === "password-unsafe"
          ? { "X-Account-Code": "ACCOUNT_PASSWORD_UNSAFE" }
          : operation === "update-profile" &&
              (error.code === "profile" ||
                error.code === "profile-event" ||
                error.code === "profile-featured" ||
                error.code === "profile-disclosure")
            ? // These failures precede a committed profile edit. Session errors
              // can occur after commit, so a generic 400 is not this assurance.
              { "X-Account-Code": "ACCOUNT_PROFILE_VALIDATION" }
            : {}
      );
    }
    // Avoid serializing errors that may contain SQL parameters, credential material, or contacts.
    return reply(
      "Account services are temporarily unavailable. Please try again later.",
      503
    );
  }
}
