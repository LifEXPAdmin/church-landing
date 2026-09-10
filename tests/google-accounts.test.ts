import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { PrismaClient } from "@prisma/client";
import {
  beginGoogleAttempt,
  finishGoogleAttempt,
  finishGoogleSignup,
  googleSignInMethods,
  unlinkGoogleIdentity
} from "../lib/platform/google-accounts";
import {
  GOOGLE_ISSUER,
  GoogleAccountError,
  googleAuthorizationUrl,
  googleConfig,
  verifyGoogleIdToken,
  type GoogleConfig
} from "../lib/platform/google-provider";
import {
  AccountError,
  changeAccountPassword,
  loginAccount,
  readAccountSession,
  registerAccount
} from "../lib/platform/accounts";
import { revokeOtherAccountSessions } from "../lib/platform/account-sessions";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";

assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
const db = new PrismaClient();
after(() => db.$disconnect());
const password = "Fictional-google-password-1";
const unique = () => "google_" + randomBytes(6).toString("hex");
const config: GoogleConfig = {
  clientId: "fixture.apps.googleusercontent.com",
  clientSecret: "fictional-secret",
  callback: "https://127.0.0.1/api/platform/google/callback"
};
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const cert = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
const client = new OAuth2Client(config.clientId);
mock.method(client, "getFederatedSignonCertsAsync", async () => ({
  certs: { fixture: cert },
  format: "PEM"
}));
function jwt(nonce: string, extra: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: GOOGLE_ISSUER,
    aud: config.clientId,
    sub: unique(),
    email: unique() + "@example.test",
    email_verified: true,
    iat: now,
    exp: now + 600,
    nonce,
    ...extra
  };
  const raw =
    Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString(
      "base64url"
    ) +
    "." +
    Buffer.from(JSON.stringify(claims)).toString("base64url");
  return (
    raw +
    "." +
    sign("RSA-SHA256", Buffer.from(raw), keys.privateKey).toString("base64url")
  );
}
const exchange = (
  cfg: GoogleConfig,
  code: string,
  _verifier: string,
  nonceHash: string
) => verifyGoogleIdToken(cfg, code, nonceHash, client);
async function attempt(
  extra: Record<string, unknown> = {},
  link?: { sessionToken: string; password: string }
) {
  const browserToken = createSessionToken();
  const proof = await beginGoogleAttempt(
    db,
    browserToken,
    "/platform/posts/fictional-post?secret=drop",
    link
  );
  const code = jwt(proof.nonce, extra);
  return { browserToken, ...proof, code };
}
async function finish(
  a: Awaited<ReturnType<typeof attempt>>,
  sessionToken?: string
) {
  return finishGoogleAttempt(
    db,
    config,
    { ...a, sessionToken, userAgent: "Fictional Browser" },
    exchange
  );
}
async function owner() {
  const username = unique();
  await registerAccount(db, {
    username,
    name: "Fictional Password Owner",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
async function newGoogle(extra: Record<string, unknown> = {}) {
  const subject = unique();
  const a = await attempt({ sub: subject, ...extra });
  const result = await finish(a);
  assert.equal(result.kind, "signup");
  const outcome = await finishGoogleSignup(
    db,
    a.browserToken,
    result.signupToken,
    {
      name: "Fictional Google Reader",
      username: unique(),
      adultAcknowledged: true
    },
    "Fictional Browser"
  );
  const user = await readAccountSession(db, outcome.token);
  assert.ok(user);
  return { a, outcome, user, subject };
}

test("Google configuration is off by default; authorization uses state, nonce, exact callback and S256 with only identity scopes", async () => {
  assert.equal(googleConfig({ NODE_ENV: "test" }), null);
  assert.throws(
    () => googleConfig({ NODE_ENV: "test", ACCOUNT_GOOGLE_ENABLED: "true" }),
    GoogleAccountError
  );
  const a = await attempt();
  const url = new URL(
    googleAuthorizationUrl(config, a.state, a.nonce, a.browserToken)
  );
  assert.equal(url.origin, "https://accounts.google.com");
  for (const [key, value] of Object.entries({
    state: a.state,
    nonce: a.nonce,
    redirect_uri: config.callback,
    code_challenge_method: "S256",
    response_type: "code",
    scope: "openid email profile"
  }))
    assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.ok(!url.href.includes(a.browserToken));
  const row = await db.platformGoogleAttempt.findUniqueOrThrow({
    where: { stateHash: hashSessionToken(a.state) }
  });
  assert.equal(row.returnTo, "/platform/posts/fictional-post");
  assert.ok(row.expiresAt.getTime() - row.createdAt.getTime() <= 600_000);
  for (const raw of [a.state, a.nonce, a.browserToken, a.code])
    assert.ok(!JSON.stringify(row).includes(raw));
});

test("the real verification library rejects forged, expired, wrong-audience/issuer/nonce and unverified identity tokens", async () => {
  const nonce = createSessionToken();
  const now = Math.floor(Date.now() / 1000);
  for (const claims of [
    { exp: now - 10 },
    { aud: "another-client" },
    { azp: "another-client" },
    { iss: "https://attacker.invalid" },
    { nonce: createSessionToken() },
    { nonce: "" },
    { iat: now + 120 },
    { email_verified: false },
    { sub: "" }
  ]) {
    await assert.rejects(
      verifyGoogleIdToken(
        config,
        jwt(nonce, claims),
        hashSessionToken(nonce),
        client
      ),
      GoogleAccountError
    );
  }
  const forged = jwt(nonce).split(".");
  forged[2] = randomBytes(256).toString("base64url");
  await assert.rejects(
    verifyGoogleIdToken(
      config,
      forged.join("."),
      hashSessionToken(nonce),
      client
    ),
    GoogleAccountError
  );
  const thirdParty = await verifyGoogleIdToken(
    config,
    jwt(nonce),
    hashSessionToken(nonce),
    client
  );
  assert.equal(thirdParty.emailAuthoritative, false);
  const workspace = await verifyGoogleIdToken(
    config,
    jwt(nonce, { hd: "example.test" }),
    hashSessionToken(nonce),
    client
  );
  assert.equal(workspace.emailAuthoritative, true);
});

test("browser/state/nonce/expiry failures never create accounts, bindings or sessions", async () => {
  const before = [
    await db.platformUser.count(),
    await db.platformGoogleIdentity.count(),
    await db.platformSession.count()
  ];
  const a = await attempt();
  for (const input of [
    { ...a, state: createSessionToken() },
    { ...a, browserToken: createSessionToken() },
    { ...a, code: jwt(createSessionToken()) },
    { ...a, code: "" }
  ])
    await assert.rejects(
      finishGoogleAttempt(db, config, input, exchange),
      GoogleAccountError
    );
  await db.platformGoogleAttempt.update({
    where: { stateHash: hashSessionToken(a.state) },
    data: { expiresAt: new Date(0) }
  });
  await assert.rejects(finish(a), GoogleAccountError);
  assert.deepEqual(
    [
      await db.platformUser.count(),
      await db.platformGoogleIdentity.count(),
      await db.platformSession.count()
    ],
    before
  );
});

test("new Google signup requires the same browser, one-use proof, profile and adult acknowledgment; third-party email is not independently verified", async () => {
  const a = await attempt();
  const result = await finish(a);
  assert.equal(result.kind, "signup");
  await assert.rejects(finish(a), GoogleAccountError);
  const input = {
    name: "Fictional New Reader",
    username: unique(),
    adultAcknowledged: true
  };
  await assert.rejects(
    finishGoogleSignup(
      db,
      createSessionToken(),
      result.signupToken,
      input,
      null
    ),
    GoogleAccountError
  );
  await assert.rejects(
    finishGoogleSignup(
      db,
      a.browserToken,
      result.signupToken,
      { ...input, adultAcknowledged: false },
      null
    ),
    GoogleAccountError
  );
  assert.equal(
    await db.platformUser.count({ where: { username: input.username } }),
    0
  );
  const created = await finishGoogleSignup(
    db,
    a.browserToken,
    result.signupToken,
    input,
    null
  );
  assert.equal(created.next, "/platform/posts/fictional-post");
  const user = await db.platformUser.findUniqueOrThrow({
    where: { username: input.username }
  });
  assert.equal(user.passwordHash, null);
  assert.equal(user.emailVerifiedAt, null);
  assert.ok(user.adultAcknowledgedAt);
  assert.equal(user.role, "BELIEVER");
  assert.equal(
    await db.churchCapabilityGrant.count({ where: { userId: user.id } }),
    0
  );
  assert.ok(await readAccountSession(db, created.token));
  await assert.rejects(
    finishGoogleSignup(db, a.browserToken, result.signupToken, input, null),
    GoogleAccountError
  );
  await assert.rejects(
    unlinkGoogleIdentity(db, created.token, password),
    AccountError
  );
  assert.deepEqual(await googleSignInMethods(db, created.token), {
    password: false,
    google: true
  });
});

test("matching password or legacy emails are never claimed, including a registration racing onboarding", async () => {
  for (const legacy of [false, true]) {
    const a = await owner();
    if (legacy)
      await db.platformUser.update({
        where: { id: a.user.id },
        data: { passwordHash: null }
      });
    const before = await db.platformUser.findUniqueOrThrow({
      where: { id: a.user.id }
    });
    const result = await finish(
      await attempt({ email: a.user.email, hd: "example.test" })
    );
    assert.equal(result.kind, "link-required");
    assert.equal(
      await db.platformGoogleIdentity.count({ where: { userId: a.user.id } }),
      0
    );
    assert.deepEqual(
      await db.platformUser.findUnique({ where: { id: a.user.id } }),
      before
    );
  }
  const email = unique() + "@example.test";
  const a = await attempt({ email });
  const result = await finish(a);
  assert.equal(result.kind, "signup");
  await registerAccount(db, {
    name: "Fictional Race",
    username: unique(),
    email,
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  await assert.rejects(
    finishGoogleSignup(
      db,
      a.browserToken,
      result.signupToken,
      { name: "Fictional Google", username: unique(), adultAcknowledged: true },
      null
    ),
    GoogleAccountError
  );
  assert.equal(await db.platformUser.count({ where: { email } }), 1);
});

test("authenticated linking is bound to the owner and original live session; an identity cannot be reassigned", async () => {
  const a = await owner();
  const b = await owner();
  await assert.rejects(
    beginGoogleAttempt(db, createSessionToken(), "/platform", {
      sessionToken: a.token,
      password: "Wrong-password-1"
    }),
    AccountError
  );
  const subject = unique();
  const pending = await attempt(
    { sub: subject },
    { sessionToken: a.token, password }
  );
  await assert.rejects(finish(pending, b.token), GoogleAccountError);
  assert.equal((await finish(pending, a.token)).kind, "linked");
  assert.deepEqual(await googleSignInMethods(db, a.token), {
    password: true,
    google: true
  });
  await assert.rejects(
    finish(
      await attempt({ sub: subject }, { sessionToken: b.token, password }),
      b.token
    ),
    GoogleAccountError
  );
  const stale = await attempt(
    { sub: unique() },
    { sessionToken: b.token, password }
  );
  await changeAccountPassword(
    db,
    b.token,
    password,
    "Fictional-new-password-1",
    "Fictional-new-password-1"
  );
  await assert.rejects(finish(stale, b.token), GoogleAccountError);
  const binding = await db.platformGoogleIdentity.findUniqueOrThrow({
    where: { userId: a.user.id }
  });
  assert.equal(binding.subject, subject);
});

test("returning Google subjects keep their original account and local email despite provider email changes; suspended and deactivated users cannot sign in", async () => {
  const a = await newGoogle({ hd: "example.test" });
  const b = await owner();
  const original = await db.platformUser.findUniqueOrThrow({
    where: { id: a.user.id }
  });
  const result = await finish(
    await attempt({ sub: a.subject, email: b.user.email })
  );
  assert.equal(result.kind, "signed-in");
  assert.equal((await readAccountSession(db, result.token))?.id, a.user.id);
  assert.deepEqual(
    await db.platformUser.findUnique({ where: { id: a.user.id } }),
    original
  );
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: new Date() }
  });
  assert.equal(await readAccountSession(db, result.token), null);
  await assert.rejects(
    finish(await attempt({ sub: a.subject })),
    GoogleAccountError
  );
  await db.platformUser.update({
    where: { id: a.user.id },
    data: { suspendedAt: null, deactivatedAt: new Date() }
  });
  await assert.rejects(
    finish(await attempt({ sub: a.subject })),
    GoogleAccountError
  );
});

test("concurrent callbacks and new-identity completions produce one binding/account, without replay sessions", async () => {
  const a = await attempt();
  const completions = await Promise.allSettled([finish(a), finish(a)]);
  assert.equal(completions.filter((x) => x.status === "fulfilled").length, 1);
  const subject = unique();
  const email = unique() + "@example.test";
  const p = await attempt({ sub: subject, email });
  const q = await attempt({ sub: subject, email });
  const [one, two] = await Promise.all([finish(p), finish(q)]);
  assert.equal(one.kind, "signup");
  assert.equal(two.kind, "signup");
  const input = {
    name: "Fictional Concurrent",
    username: unique(),
    adultAcknowledged: true
  };
  const [x, y] = await Promise.all([
    finishGoogleSignup(db, p.browserToken, one.signupToken, input, null),
    finishGoogleSignup(db, q.browserToken, two.signupToken, input, null)
  ]);
  assert.equal(
    (await readAccountSession(db, x.token))?.id,
    (await readAccountSession(db, y.token))?.id
  );
  assert.equal(await db.platformUser.count({ where: { email } }), 1);
  assert.equal(
    await db.platformGoogleIdentity.count({ where: { subject } }),
    1
  );
});

test("revocation applies to Google sessions and unlink keeps password access, revokes other sessions and prevents fresh automatic relinking", async () => {
  const a = await owner();
  const subject = unique();
  await finish(
    await attempt({ sub: subject }, { sessionToken: a.token, password }),
    a.token
  );
  const google = await finish(await attempt({ sub: subject }));
  assert.equal(google.kind, "signed-in");
  await revokeOtherAccountSessions(db, a.token, password);
  assert.equal(await readAccountSession(db, google.token), null);
  const other = await finish(await attempt({ sub: subject }));
  assert.equal(other.kind, "signed-in");
  await assert.rejects(
    unlinkGoogleIdentity(db, a.token, "Wrong-password-1"),
    AccountError
  );
  await unlinkGoogleIdentity(db, a.token, password);
  assert.ok(await readAccountSession(db, a.token));
  assert.equal(await readAccountSession(db, other.token), null);
  assert.deepEqual(await googleSignInMethods(db, a.token), {
    password: true,
    google: false
  });
  assert.equal(
    (await finish(await attempt({ sub: subject, email: a.user.email }))).kind,
    "link-required"
  );
  assert.ok(await loginAccount(db, a.user.email, password, null));
});
