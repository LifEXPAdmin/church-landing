import test, { after, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { PrismaClient } from "@prisma/client";
import {
  handleGoogleRequest,
  handleGoogleCallback
} from "../lib/platform/google-boundary";
import {
  handleAccountRequest,
  SESSION_COOKIE
} from "../lib/platform/account-boundary";
import {
  googleCookieName,
  googleRequestToken
} from "../lib/platform/google-cookies";
import {
  GOOGLE_ISSUER,
  googleConfig,
  verifyGoogleIdToken
} from "../lib/platform/google-provider";
import {
  readAccountSession,
  loginAccount,
  registerAccount
} from "../lib/platform/accounts";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import { requestEmailChange } from "../lib/platform/account-email-change";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
const db = new PrismaClient();
after(() => db.$disconnect());
const origin = "https://127.0.0.1:54443";
beforeEach(async () => {
  process.env.ACCOUNT_ORIGIN = origin;
  process.env.ACCOUNT_GOOGLE_ENABLED = "true";
  process.env.GOOGLE_CLIENT_ID = "fixture.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "fictional-boundary-secret";
  process.env.ACCOUNT_DELIVERY_MODE = "test-sink";
  await db.platformAuthLimit.deleteMany();
});
const password = "Fictional-google-boundary-password-1";
const unique = () => "gb_" + randomBytes(6).toString("hex");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const client = new OAuth2Client("fixture.apps.googleusercontent.com");
mock.method(client, "getFederatedSignonCertsAsync", async () => ({
  certs: {
    fixture: keys.publicKey.export({ type: "spki", format: "pem" }).toString()
  },
  format: "PEM"
}));
function jwt(nonce: string, subject: string, email: string) {
  const now = Math.floor(Date.now() / 1000);
  const raw =
    Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString(
      "base64url"
    ) +
    "." +
    Buffer.from(
      JSON.stringify({
        iss: GOOGLE_ISSUER,
        aud: "fixture.apps.googleusercontent.com",
        sub: subject,
        email,
        email_verified: true,
        nonce,
        iat: now,
        exp: now + 600
      })
    ).toString("base64url");
  return (
    raw +
    "." +
    sign("RSA-SHA256", Buffer.from(raw), keys.privateKey).toString("base64url")
  );
}
const exchange = (
  config: NonNullable<ReturnType<typeof googleConfig>>,
  code: string,
  _verifier: string,
  nonce: string
) => verifyGoogleIdToken(config, code, nonce, client);
type Jar = Map<string, string>;
function absorb(jar: Jar, response: Response) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const [name, value] = pair.split("=");
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}
function request(
  path: string,
  body: object,
  jar: Jar,
  headers: Record<string, string> = {}
) {
  return new Request(origin + path, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
      ...headers
    },
    body: JSON.stringify(body)
  });
}
async function post(
  body: object,
  jar: Jar = new Map(),
  headers: Record<string, string> = {}
) {
  const response = await handleGoogleRequest(
    db,
    request("/api/platform/google", body, jar, headers)
  );
  absorb(jar, response);
  return response;
}
async function account(body: object, jar: Jar) {
  const response = await handleAccountRequest(
    db,
    request("/api/platform/account", body, jar)
  );
  absorb(jar, response);
  return response;
}
async function start(
  jar: Jar,
  body: object = {
    operation: "start",
    next: "/platform/posts/fictional-discussion"
  }
) {
  const response = await post(body, jar);
  assert.equal(response.status, 200, await response.clone().text());
  return new URL((await response.json()).redirect);
}
async function callback(
  jar: Jar,
  url: URL,
  subject = unique(),
  email = unique() + "@example.test",
  options: Record<string, string> = {}
) {
  const params = new URLSearchParams({
    state: url.searchParams.get("state")!,
    code: jwt(url.searchParams.get("nonce")!, subject, email),
    ...options
  });
  const response = await handleGoogleCallback(
    db,
    new Request(origin + "/api/platform/google/callback?" + params, {
      headers: {
        Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; ")
      }
    }),
    exchange
  );
  absorb(jar, response);
  return response;
}
async function owner(googleOnly = false) {
  const username = unique();
  await registerAccount(db, {
    username,
    name: "Fictional Google Boundary",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  const token = await loginAccount(
    db,
    user.email,
    password,
    "Fictional Browser"
  );
  const subject = unique();
  await db.platformGoogleIdentity.create({
    data: { issuer: GOOGLE_ISSUER, subject, userId: user.id }
  });
  if (googleOnly)
    await db.platformUser.update({
      where: { id: user.id },
      data: { passwordHash: null }
    });
  return { user, subject, token, jar: new Map([[SESSION_COOKIE, token]]) };
}
async function reauth(
  person: Awaited<ReturnType<typeof owner>>,
  purpose: string,
  extra: object = {}
) {
  const url = await start(person.jar, {
    operation: "reauthenticate",
    purpose,
    ...extra
  });
  const response = await callback(
    person.jar,
    url,
    person.subject,
    person.user.email
  );
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    purpose === "confirm-email-change"
      ? "/platform/account/change-email"
      : "/platform/settings"
  );
  return response;
}

test("Google boundary rejects forged origins, methods, fields, body overflow and disabled configuration without account writes", async () => {
  const before = await db.platformGoogleAttempt.count();
  assert.equal(
    (
      await post({ operation: "start" }, new Map(), {
        Origin: "https://evil.example"
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post({ operation: "start" }, new Map(), {
        "Sec-Fetch-Site": "cross-site"
      })
    ).status,
    403
  );
  assert.equal(
    (
      await handleGoogleRequest(
        db,
        new Request(origin + "/api/platform/google")
      )
    ).status,
    405
  );
  for (const body of [
    { operation: "start", identity: { email: "forged@example.test" } },
    {
      operation: "unlink",
      currentPassword: { kind: "google-reauth", token: createSessionToken() }
    },
    { operation: "start", next: "x".repeat(9000) },
    { operation: "reauthenticate", purpose: "admin" }
  ])
    assert.equal((await post(body)).status, 400);
  process.env.ACCOUNT_GOOGLE_ENABLED = "false";
  const disabled = await post({ operation: "start" });
  assert.equal(disabled.status, 503);
  assert.equal(disabled.headers.get("cache-control"), "no-store");
  assert.deepEqual(disabled.headers.getSetCookie(), []);
  const callbackResponse = await handleGoogleCallback(
    db,
    new Request(
      origin + "/api/platform/google/callback?code=private&state=private"
    )
  );
  assert.equal(
    callbackResponse.headers.get("location"),
    "/platform/login?notice=google-unavailable"
  );
  assert.equal(await db.platformGoogleAttempt.count(), before);
});

test("authorization cookies are host-only and HttpOnly; signup completes once with only explicit profile and adult fields", async () => {
  const jar: Jar = new Map();
  const response = await post(
    {
      operation: "start",
      next: "/platform/posts/fictional-discussion?token=drop"
    },
    jar
  );
  const url = new URL((await response.json()).redirect);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  const cookieNames = response.headers
    .getSetCookie()
    .map((cookie) => cookie.split("=")[0]);
  assert.equal(cookieNames.length, new Set(cookieNames).size);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    origin + "/api/platform/google/callback"
  );
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(cookie, /^__Host-gc_google_/);
    assert.match(cookie, /Path=\/; HttpOnly; SameSite=Lax/);
    assert.match(cookie, /; Secure/);
    assert.doesNotMatch(cookie, /Domain=/i);
  }
  const browser = jar.get(googleCookieName("browser", true))!;
  assert.ok(browser);
  assert.ok(!url.toString().includes(browser));
  assert.ok(!url.toString().includes("fictional-boundary-secret"));
  const attempt = await db.platformGoogleAttempt.findUniqueOrThrow({
    where: { stateHash: hashSessionToken(url.searchParams.get("state")!) }
  });
  assert.equal(attempt.browserHash, hashSessionToken(browser));
  assert.equal(attempt.returnTo, "/platform/posts/fictional-discussion");
  const finish = await callback(jar, url);
  assert.equal(finish.headers.get("location"), "/platform/account/google");
  assert.equal(await finish.text(), "");
  assert.equal(finish.headers.get("referrer-policy"), "no-referrer");
  assert.equal(jar.has(SESSION_COOKIE), false);
  const view = await (await post({ operation: "status" }, jar)).json();
  assert.equal(view.pending, "signup");
  assert.equal(view.methods, null);
  assert.deepEqual(Object.keys(view).sort(), [
    "emailConfirmationReady",
    "message",
    "methods",
    "pending",
    "recentPurpose",
    "signedIn"
  ]);
  const username = unique();
  assert.equal(
    (
      await post(
        {
          operation: "signup",
          name: "Fictional New Member",
          username,
          adultAcknowledged: false
        },
        jar
      )
    ).status,
    400
  );
  assert.equal(
    (
      await post(
        {
          operation: "signup",
          name: "Fictional New Member",
          username,
          adultAcknowledged: true,
          role: "ADMIN"
        },
        jar
      )
    ).status,
    400
  );
  const taken = await owner();
  const takenResponse = await post(
    {
      operation: "signup",
      name: "Fictional New Member",
      username: taken.user.username,
      adultAcknowledged: true
    },
    jar
  );
  assert.equal(takenResponse.status, 409);
  assert.match(await takenResponse.text(), /username is already taken/);
  const replay = new Map(jar);
  const created = await post(
    {
      operation: "signup",
      name: "Fictional New Member",
      username,
      adultAcknowledged: true
    },
    jar
  );
  assert.equal(created.status, 200);
  assert.equal(
    (await created.json()).redirect,
    "/platform/posts/fictional-discussion"
  );
  const member = await readAccountSession(db, jar.get(SESSION_COOKIE));
  assert.equal(member?.username, username);
  const stored = await db.platformUser.findUniqueOrThrow({
    where: { username }
  });
  assert.equal(stored.role, "BELIEVER");
  assert.equal(stored.passwordHash, null);
  assert.ok(stored.adultAcknowledgedAt);
  assert.equal(
    [...jar.keys()].some((key) => key.startsWith("__Host-gc_google_")),
    false
  );
  assert.equal(
    (
      await post(
        {
          operation: "signup",
          name: "Fictional New Member",
          username,
          adultAcknowledged: true
        },
        replay
      )
    ).status,
    400
  );
});

test("callbacks clear provider parameters and deny wrong browser, duplicate state, cancellation and account switching", async () => {
  const jar: Jar = new Map();
  const url = await start(jar);
  const wrong = new Map([
    [googleCookieName("browser", true), createSessionToken()]
  ]);
  assert.equal(
    (await callback(wrong, url)).headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  const canceled = await callback(
    jar,
    url,
    unique(),
    "fictional@example.test",
    { error: "access_denied" }
  );
  assert.equal(
    canceled.headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  const duplicate = await handleGoogleCallback(
    db,
    new Request(
      origin + "/api/platform/google/callback?state=a&state=b&code=secret"
    )
  );
  assert.equal(
    duplicate.headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  const person = await owner();
  jar.set(SESSION_COOKIE, person.token);
  assert.equal(
    (await callback(jar, url)).headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  assert.equal(jar.get(SESSION_COOKIE), person.token);
  assert.equal((await post({ operation: "start" }, jar)).status, 409);
  jar.delete(SESSION_COOKIE);
  const cancel = await post({ operation: "cancel" }, jar);
  assert.equal(cancel.status, 200);
  assert.equal(jar.size, 0);
  assert.equal(
    await db.platformGoogleAttempt.count({
      where: { stateHash: hashSessionToken(url.searchParams.get("state")!) }
    }),
    0
  );
});

test("returning Google identity gets the same database account and a safe destination; matching email requires legitimate linking", async () => {
  const person = await owner();
  const jar: Jar = new Map();
  const url = await start(jar, {
    operation: "start",
    next: "https://evil.example/take"
  });
  const signedIn = await callback(
    jar,
    url,
    person.subject,
    unique() + "@example.test"
  );
  assert.equal(signedIn.headers.get("location"), "/platform");
  assert.equal(
    (await readAccountSession(db, jar.get(SESSION_COOKIE)))?.id,
    person.user.id
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: person.user.id } }))
      .email,
    person.user.email
  );
  const collisionJar: Jar = new Map();
  const collisionUrl = await start(collisionJar);
  const collision = await callback(
    collisionJar,
    collisionUrl,
    unique(),
    person.user.email
  );
  assert.match(collision.headers.get("location")!, /^\/platform\/login\?/);
  assert.match(
    collision.headers.get("location")!,
    /notice=google-link-required/
  );
  assert.equal(collisionJar.has(SESSION_COOKIE), false);
});

test("HTTP Google confirmation cannot cross action, session or credential boundaries and is consumed only by the explicit action", async () => {
  const person = await owner(true);
  const extra = createSessionToken();
  await db.platformSession.create({
    data: {
      tokenHash: hashSessionToken(extra),
      userId: person.user.id,
      credentialVersion: person.user.credentialVersion,
      expiresAt: new Date(Date.now() + 60_000)
    }
  });
  await reauth(person, "revoke-other-sessions");
  assert.equal(
    await db.platformSession.count({ where: { userId: person.user.id } }),
    2
  );
  const proof = person.jar.get(googleCookieName("recent", true))!;
  assert.ok(proof);
  const info = await (await post({ operation: "status" }, person.jar)).json();
  assert.deepEqual(info.methods, { password: false, google: true });
  assert.equal(info.recentPurpose, "revoke-other-sessions");
  assert.ok(!JSON.stringify(info).includes(proof));
  const otherSessionJar = new Map(person.jar).set(SESSION_COOKIE, extra);
  assert.equal(
    (
      await account(
        { operation: "revoke-other-sessions", credentialMethod: "google" },
        otherSessionJar
      )
    ).status,
    400
  );
  assert.equal(
    (
      await account(
        { operation: "prepare-export", credentialMethod: "google" },
        person.jar
      )
    ).status,
    400
  );
  assert.equal(
    (
      await account(
        {
          operation: "revoke-other-sessions",
          currentPassword: { kind: "google-reauth", token: proof }
        },
        person.jar
      )
    ).status,
    400
  );
  assert.equal(
    (
      await account(
        {
          operation: "revoke-other-sessions",
          currentPassword: password,
          credentialMethod: "google"
        },
        person.jar
      )
    ).status,
    400
  );
  const replay = new Map(person.jar);
  const revoked = await account(
    { operation: "revoke-other-sessions", credentialMethod: "google" },
    person.jar
  );
  assert.equal(revoked.status, 200);
  assert.equal(
    await db.platformSession.count({ where: { userId: person.user.id } }),
    1
  );
  assert.equal(person.jar.has(googleCookieName("recent", true)), false);
  assert.equal(
    (
      await account(
        { operation: "revoke-other-sessions", credentialMethod: "google" },
        replay
      )
    ).status,
    400
  );
  assert.equal(await readAccountSession(db, extra), null);
});

test("Google-only account can prepare its private export and add a password through HttpOnly proofs", async () => {
  const person = await owner(true);
  await reauth(person, "prepare-export");
  const response = await account(
    { operation: "prepare-export", credentialMethod: "google" },
    person.jar
  );
  assert.equal(response.status, 200);
  const { authorization } = await response.json();
  const file = await account(
    { operation: "download-export", authorization },
    person.jar
  );
  assert.equal(file.status, 200);
  assert.match(file.headers.get("content-disposition")!, /attachment/);
  const content = await file.text();
  assert.ok(content.includes(person.subject));
  assert.ok(!content.includes(person.token));
  assert.doesNotMatch(content, /tokenHash|browserHash|signupTokenHash/);
  await reauth(person, "change-password");
  const changed = await account(
    {
      operation: "change-password",
      credentialMethod: "google",
      password,
      confirmPassword: password
    },
    person.jar
  );
  assert.equal(changed.status, 200);
  assert.equal(person.jar.has(SESSION_COOKIE), false);
  assert.equal(person.jar.size, 0);
  assert.equal(await readAccountSession(db, person.token), null);
  assert.ok(await loginAccount(db, person.user.email, password, null));
  assert.equal(
    await db.platformGoogleIdentity.count({
      where: { userId: person.user.id }
    }),
    1
  );
});

test("email-change token survives Google redirect only in an owner-bound HttpOnly cookie and confirmation revokes every session", async () => {
  const person = await owner();
  let emailToken = "";
  await (
    await requestEmailChange(
      db,
      person.token,
      password,
      unique() + "@example.test",
      async (_email, _purpose, token) => {
        emailToken = token;
      }
    )
  )();
  assert.ok(emailToken);
  await db.platformUser.update({
    where: { id: person.user.id },
    data: { passwordHash: null }
  });
  const stranger = await owner();
  assert.equal(
    (
      await post(
        {
          operation: "reauthenticate",
          purpose: "confirm-email-change",
          emailToken
        },
        stranger.jar
      )
    ).status,
    400
  );
  const begin = await post(
    {
      operation: "reauthenticate",
      purpose: "confirm-email-change",
      emailToken
    },
    person.jar
  );
  assert.equal(begin.status, 200);
  const beginData = await begin.json();
  assert.ok(!JSON.stringify(beginData).includes(emailToken));
  assert.equal(person.jar.get(googleCookieName("email", true)), emailToken);
  const completed = await callback(
    person.jar,
    new URL(beginData.redirect),
    person.subject,
    person.user.email
  );
  assert.equal(
    completed.headers.get("location"),
    "/platform/account/change-email"
  );
  const state = await (await post({ operation: "status" }, person.jar)).json();
  assert.equal(state.emailConfirmationReady, true);
  assert.equal(state.recentPurpose, "confirm-email-change");
  assert.ok(!JSON.stringify(state).includes(emailToken));
  assert.equal(
    (
      await account(
        { operation: "confirm-email-change", credentialMethod: "google" },
        person.jar
      )
    ).status,
    200
  );
  assert.equal(person.jar.size, 0);
  assert.equal(await readAccountSession(db, person.token), null);
  const updated = await db.platformUser.findUniqueOrThrow({
    where: { id: person.user.id }
  });
  assert.notEqual(updated.email, person.user.email);
  assert.equal(updated.passwordHash, null);
});

test("a password-backed owner may choose password confirmation after the Google email-link return", async () => {
  const person = await owner();
  let emailToken = "";
  await (
    await requestEmailChange(
      db,
      person.token,
      password,
      unique() + "@example.test",
      async (_email, _purpose, token) => {
        emailToken = token;
      }
    )
  )();
  await reauth(person, "confirm-email-change", { emailToken });
  const wrong = await account(
    { operation: "confirm-email-change", currentPassword: "wrong-password" },
    person.jar
  );
  assert.equal(wrong.status, 400);
  const changed = await account(
    { operation: "confirm-email-change", currentPassword: password },
    person.jar
  );
  assert.equal(changed.status, 200);
  assert.equal(person.jar.size, 0);
  assert.equal(await readAccountSession(db, person.token), null);
});

test("Google deactivation and reactivation require separate confirmation and never automatically restore sign-in", async () => {
  const person = await owner(true);
  await reauth(person, "deactivate-account");
  assert.equal(
    (
      await account(
        {
          operation: "deactivate-account",
          credentialMethod: "google",
          confirmed: false
        },
        person.jar
      )
    ).status,
    400
  );
  assert.equal(
    (
      await account(
        {
          operation: "deactivate-account",
          credentialMethod: "google",
          confirmed: true
        },
        person.jar
      )
    ).status,
    200
  );
  assert.equal(person.jar.size, 0);
  const url = await start(person.jar);
  const result = await callback(
    person.jar,
    url,
    person.subject,
    person.user.email
  );
  assert.equal(result.headers.get("location"), "/platform/account/google");
  assert.equal(person.jar.has(SESSION_COOKIE), false);
  assert.equal(
    (await (await post({ operation: "status" }, person.jar)).json()).pending,
    "reactivate"
  );
  assert.equal(
    (await post({ operation: "reactivate", confirmed: false }, person.jar))
      .status,
    400
  );
  assert.equal(
    (await post({ operation: "reactivate", confirmed: true }, person.jar))
      .status,
    200
  );
  assert.equal(person.jar.size, 0);
  assert.equal(
    await db.platformSession.count({ where: { userId: person.user.id } }),
    0
  );
  assert.equal(
    (await db.platformUser.findUniqueOrThrow({ where: { id: person.user.id } }))
      .deactivatedAt,
    null
  );
});

test("authenticated link and unlink use the original session and preserve a usable password method", async () => {
  const person = await owner();
  await db.platformGoogleIdentity.deleteMany({
    where: { userId: person.user.id }
  });
  assert.equal(
    (await post({ operation: "link", currentPassword: "wrong" }, person.jar))
      .status,
    400
  );
  const url = await start(person.jar, {
    operation: "link",
    currentPassword: password
  });
  const result = await callback(
    person.jar,
    url,
    person.subject,
    person.user.email
  );
  assert.equal(
    result.headers.get("location"),
    "/platform/settings?notice=google-linked"
  );
  await reauth(person, "unlink-google");
  assert.equal(
    (
      await post(
        { operation: "unlink", credentialMethod: "google" },
        person.jar
      )
    ).status,
    200
  );
  assert.equal(
    await db.platformGoogleIdentity.count({
      where: { userId: person.user.id }
    }),
    0
  );
  assert.equal(
    (await readAccountSession(db, person.token))?.id,
    person.user.id
  );
  assert.ok(await loginAccount(db, person.user.email, password, null));
  const only = await owner(true);
  await reauth(only, "unlink-google");
  assert.equal(
    (await post({ operation: "unlink", credentialMethod: "google" }, only.jar))
      .status,
    400
  );
  assert.equal(
    await db.platformGoogleIdentity.count({ where: { userId: only.user.id } }),
    1
  );
});

test("Google cookies reject duplicate or insecure names and durable rate limits survive across requests", async () => {
  const token = createSessionToken();
  const cookieName = googleCookieName("recent", true);
  assert.equal(
    googleRequestToken(
      new Request(origin, {
        headers: { Cookie: `${cookieName}=${token}; ${cookieName}=${token}` }
      }),
      "recent",
      true
    ),
    undefined
  );
  assert.equal(
    googleRequestToken(
      new Request(origin, { headers: { Cookie: `gc_google_recent=${token}` } }),
      "recent",
      true
    ),
    undefined
  );
  const jar: Jar = new Map();
  for (let i = 0; i < 10; i++)
    assert.equal((await post({ operation: "status" }, jar)).status, 200);
  const limited = await post({ operation: "status" }, jar);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "900");
  assert.equal(limited.headers.get("cache-control"), "no-store");
  assert.ok(await db.platformAuthLimit.count());
});
