import type { PrismaClient } from "@prisma/client";
import { AccountError, readAccountSession } from "./accounts";
import { accountConfig } from "./account-config";
import { allowAccountAttempt } from "./account-limits";
import {
  readBody,
  requestSessionToken,
  sessionCookie
} from "./account-boundary";
import { accountEntryHref } from "./account-entry";
import { createSessionToken, hashSessionToken, validToken } from "./auth";
import { isRecentAuthenticationPurpose } from "./account-credential";
import { AccountLifecycleError } from "./account-lifecycle";
import { checkPendingEmailChange } from "./account-email-change";
import {
  beginGoogleAttempt,
  beginGoogleReauthentication,
  finishGoogleAttempt,
  finishGoogleSignup,
  finishGoogleReactivation,
  googleSignInMethods,
  unlinkGoogleIdentity
} from "./google-accounts";
import {
  googleConfig,
  GoogleAccountError,
  googleAuthorizationUrl,
  exchangeGoogleCode
} from "./google-provider";
import {
  googleCookie,
  googleRequestToken,
  clearGoogleCookies,
  requestAccountCredential
} from "./google-cookies";
import { withOwnedSession } from "./account-sessions";

const responseHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff"
};
function reply(message: string, status = 200, extra: object = {}) {
  return Response.json(
    { message, ...extra },
    { status, headers: responseHeaders }
  );
}
function redirect(path: string) {
  return new Response(null, {
    status: 303,
    headers: { ...responseHeaders, Location: path }
  });
}
function unavailable() {
  return reply(
    "Google sign-in is not available yet. Use email sign-in or keep browsing.",
    503
  );
}
function ip(request: Request) {
  return process.env.VERCEL
    ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
    : "local";
}
async function cancelBrowserAttempts(db: PrismaClient, browser: unknown) {
  if (validToken(browser))
    await db.platformGoogleAttempt.deleteMany({
      where: { browserHash: hashSessionToken(browser), completedAt: null }
    });
}
async function status(db: PrismaClient, request: Request, secure: boolean) {
  const token = requestSessionToken(request);
  const signedIn = !!(await readAccountSession(db, token));
  let methods: { password: boolean; google: boolean } | null = null;
  let recentPurpose: string | null = null;
  let emailConfirmationReady = false;
  if (signedIn) {
    methods = await googleSignInMethods(db, token);
    const recent = googleRequestToken(request, "recent", secure);
    if (recent) {
      recentPurpose = await withOwnedSession(db, token, async (tx, current) => {
        const proof = await tx.platformRecentAuthentication.findUnique({
          where: { tokenHash: hashSessionToken(recent) },
          select: {
            userId: true,
            sessionId: true,
            credentialVersion: true,
            purpose: true,
            expiresAt: true,
            googleIdentity: { select: { userId: true } }
          }
        });
        return proof &&
          proof.userId === current.userId &&
          proof.googleIdentity.userId === current.userId &&
          proof.sessionId === current.id &&
          proof.credentialVersion === current.credentialVersion &&
          proof.expiresAt > new Date() &&
          isRecentAuthenticationPurpose(proof.purpose)
          ? proof.purpose
          : null;
      });
    }
    try {
      await checkPendingEmailChange(
        db,
        token,
        googleRequestToken(request, "email", secure)
      );
      emailConfirmationReady = true;
    } catch (error) {
      if (!(error instanceof AccountError)) throw error;
    }
  }
  let pending: "signup" | "reactivate" | null = null;
  const browser = googleRequestToken(request, "browser", secure);
  if (!signedIn && browser) {
    for (const kind of ["signup", "reactivate"] as const) {
      const continuation = googleRequestToken(request, kind, secure);
      if (!continuation) continue;
      const proof = await db.platformGoogleAttempt.findFirst({
        where: {
          browserHash: hashSessionToken(browser),
          ...(kind === "signup"
            ? { signupTokenHash: hashSessionToken(continuation) }
            : { reactivationTokenHash: hashSessionToken(continuation) }),
          consumedAt: { not: null },
          completedAt: null,
          expiresAt: { gt: new Date() }
        },
        select: { id: true }
      });
      if (proof) pending = kind;
    }
  }
  return { signedIn, methods, recentPurpose, emailConfirmationReady, pending };
}

export async function handleGoogleRequest(db: PrismaClient, request: Request) {
  if (request.method !== "POST") {
    const response = reply("Use the account controls to continue.", 405);
    response.headers.set("Allow", "POST");
    return response;
  }
  try {
    const account = accountConfig();
    if (
      request.headers.get("origin") !== account.origin ||
      request.headers.get("sec-fetch-site") === "cross-site"
    )
      return reply(
        "Open the account controls on this website and try again.",
        403
      );
    const config = googleConfig();
    if (!config) return unavailable();
    const body = await readBody(request);
    const fields: Record<string, string[]> = {
      start: ["next"],
      link: ["currentPassword"],
      reauthenticate: ["purpose", "emailToken"],
      signup: ["name", "username", "adultAcknowledged"],
      reactivate: ["confirmed"],
      status: [],
      cancel: [],
      unlink: ["currentPassword", "credentialMethod"]
    };
    const operation = body.operation;
    if (
      typeof operation !== "string" ||
      !Object.hasOwn(fields, operation) ||
      Object.keys(body).some(
        (key) => key !== "operation" && !fields[operation].includes(key)
      ) ||
      (body.currentPassword !== undefined &&
        typeof body.currentPassword !== "string") ||
      (body.credentialMethod !== undefined &&
        body.credentialMethod !== "google") ||
      (body.credentialMethod === "google" && body.currentPassword !== undefined)
    )
      return reply("Check the fields and try again.", 400);
    const sessionToken = requestSessionToken(request);
    const browser = googleRequestToken(
      request,
      "browser",
      account.secureCookie
    );
    if (
      !(await allowAccountAttempt(
        db,
        account.rateSecret,
        "google-" + operation,
        ip(request),
        sessionToken ?? browser ?? "anonymous"
      ))
    ) {
      const response = reply(
        "Too many attempts. Wait 15 minutes and try again.",
        429
      );
      response.headers.set("Retry-After", "900");
      return response;
    }
    if (operation === "status")
      return reply(
        "Account options loaded.",
        200,
        await status(db, request, account.secureCookie)
      );
    if (operation === "cancel") {
      await cancelBrowserAttempts(db, browser);
      const recent = googleRequestToken(
        request,
        "recent",
        account.secureCookie
      );
      if (recent)
        await db.platformRecentAuthentication.deleteMany({
          where: { tokenHash: hashSessionToken(recent) }
        });
      const response = reply("Google confirmation canceled.", 200, {
        redirect: "/platform/login"
      });
      clearGoogleCookies(response, account.secureCookie);
      return response;
    }
    if (operation === "unlink") {
      await unlinkGoogleIdentity(
        db,
        sessionToken,
        requestAccountCredential(request, body, account.secureCookie)
      );
      const response = reply(
        "Google has been disconnected. Your password sign-in remains available."
      );
      clearGoogleCookies(response, account.secureCookie);
      return response;
    }
    if (
      operation === "start" ||
      operation === "signup" ||
      operation === "reactivate"
    ) {
      if (await readAccountSession(db, sessionToken))
        return reply("Sign out before signing into another account.", 409);
    }
    if (operation === "signup") {
      const result = await finishGoogleSignup(
        db,
        browser,
        googleRequestToken(request, "signup", account.secureCookie),
        body,
        request.headers.get("user-agent")
      );
      const response = reply("Your account is ready.", 200, {
        redirect: result.next
      });
      clearGoogleCookies(response, account.secureCookie);
      response.headers.append(
        "Set-Cookie",
        sessionCookie(result.token, account.secureCookie)
      );
      return response;
    }
    if (operation === "reactivate") {
      const result = await finishGoogleReactivation(
        db,
        browser,
        googleRequestToken(request, "reactivate", account.secureCookie),
        body.confirmed
      );
      const response = reply(
        "Your account is active. Sign in to continue.",
        200,
        {
          redirect:
            accountEntryHref("login", result.next) +
            (accountEntryHref("login", result.next).includes("?") ? "&" : "?") +
            "notice=reactivated"
        }
      );
      clearGoogleCookies(response, account.secureCookie);
      return response;
    }
    const newBrowser = createSessionToken();
    let attempt;
    let emailToken: string | undefined;
    if (operation === "reauthenticate") {
      if (!isRecentAuthenticationPurpose(body.purpose))
        return reply("Choose an account action to confirm.", 400);
      if (body.purpose === "confirm-email-change") {
        if (account.delivery === "disabled")
          return reply("Sign-in email changes are not available yet.", 503);
        const candidate =
          body.emailToken ??
          googleRequestToken(request, "email", account.secureCookie);
        await checkPendingEmailChange(db, sessionToken, candidate);
        emailToken = candidate as string;
      } else if (body.emailToken !== undefined) {
        return reply("Check the fields and try again.", 400);
      }
      attempt = await beginGoogleReauthentication(
        db,
        sessionToken,
        newBrowser,
        body.purpose,
        "/platform/settings"
      );
    } else {
      attempt = await beginGoogleAttempt(
        db,
        newBrowser,
        operation === "link" ? "/platform/settings" : body.next,
        operation === "link"
          ? { sessionToken, password: body.currentPassword }
          : undefined
      );
    }
    await cancelBrowserAttempts(db, browser);
    const response = reply("Continue with Google.", 200, {
      redirect: googleAuthorizationUrl(
        config,
        attempt.state,
        attempt.nonce,
        newBrowser,
        operation === "reauthenticate"
      )
    });
    clearGoogleCookies(
      response,
      account.secureCookie,
      emailToken ? ["browser", "email"] : ["browser"]
    );
    response.headers.append(
      "Set-Cookie",
      googleCookie("browser", newBrowser, account.secureCookie)
    );
    if (emailToken)
      response.headers.append(
        "Set-Cookie",
        googleCookie("email", emailToken, account.secureCookie)
      );
    return response;
  } catch (error) {
    if (error instanceof AccountLifecycleError)
      return reply(
        "Confirm that you understand the account change before continuing.",
        400
      );
    if (error instanceof AccountError)
      return reply(
        error.code === "session"
          ? "Sign in again to continue."
          : "Account confirmation failed. Check your password or start a new confirmation.",
        error.code === "session" ? 401 : 400
      );
    if (error instanceof GoogleAccountError || error instanceof SyntaxError)
      return reply(
        "Google sign-in could not be completed. Try again or use email sign-in.",
        400
      );
    // Never log provider errors, authorization codes, SQL parameters or cookies.
    return reply(
      "Google sign-in is temporarily unavailable. Try again later.",
      503
    );
  }
}

export async function handleGoogleCallback(
  db: PrismaClient,
  request: Request,
  // Trusted boundary-test seam. Production routes never supply an adapter.
  exchange: typeof exchangeGoogleCode = exchangeGoogleCode
) {
  if (request.method !== "GET") {
    const response = reply("Use Google sign-in to continue.", 405);
    response.headers.set("Allow", "GET");
    return response;
  }
  try {
    const account = accountConfig();
    const config = googleConfig();
    if (!config) return redirect("/platform/login?notice=google-unavailable");
    const url = new URL(request.url);
    const params = url.searchParams;
    if (
      url.origin !== account.origin ||
      url.pathname !== "/api/platform/google/callback" ||
      params.getAll("state").length !== 1 ||
      params.getAll("code").length !== 1 ||
      params.has("error")
    )
      throw new GoogleAccountError();
    const browser = googleRequestToken(
      request,
      "browser",
      account.secureCookie
    );
    if (
      !(await allowAccountAttempt(
        db,
        account.rateSecret,
        "google-callback",
        ip(request),
        browser ?? "anonymous"
      ))
    )
      return redirect("/platform/login?notice=google-retry");
    // A fresh anonymous login cannot replace an account signed in during the redirect.
    const existing = await readAccountSession(db, requestSessionToken(request));
    if (existing) {
      if (!validToken(params.get("state")) || !browser)
        throw new GoogleAccountError();
      const attempt = await db.platformGoogleAttempt.findUnique({
        where: { stateHash: hashSessionToken(params.get("state")!) },
        select: { linkUserId: true, browserHash: true }
      });
      if (
        attempt?.linkUserId !== existing.id ||
        attempt.browserHash !== hashSessionToken(browser)
      )
        throw new GoogleAccountError();
    }
    const result = await finishGoogleAttempt(
      db,
      config,
      {
        state: params.get("state"),
        code: params.get("code"),
        browserToken: browser,
        sessionToken: requestSessionToken(request),
        userAgent: request.headers.get("user-agent")
      },
      exchange
    );
    if (result.kind === "signup" || result.kind === "reactivate") {
      const response = redirect("/platform/account/google");
      response.headers.append(
        "Set-Cookie",
        googleCookie(
          result.kind,
          result.kind === "signup"
            ? result.signupToken
            : result.reactivationToken,
          account.secureCookie
        )
      );
      return response;
    }
    if (result.kind === "reauthenticated") {
      const response = redirect(
        result.purpose === "confirm-email-change"
          ? "/platform/account/change-email"
          : "/platform/settings"
      );
      response.headers.append(
        "Set-Cookie",
        googleCookie("browser", "", account.secureCookie)
      );
      response.headers.append(
        "Set-Cookie",
        googleCookie("recent", result.recentToken, account.secureCookie, 300)
      );
      return response;
    }
    const response = redirect(
      result.kind === "link-required"
        ? accountEntryHref("login", result.next) +
            (accountEntryHref("login", result.next).includes("?") ? "&" : "?") +
            "notice=google-link-required"
        : result.kind === "linked"
          ? "/platform/settings?notice=google-linked"
          : result.next
    );
    clearGoogleCookies(response, account.secureCookie);
    if (result.kind === "signed-in")
      response.headers.append(
        "Set-Cookie",
        sessionCookie(result.token, account.secureCookie)
      );
    return response;
  } catch {
    // The callback is never rendered; strip provider parameters on every outcome.
    return redirect("/platform/login?notice=google-retry");
  }
}
