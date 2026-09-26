import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  loginAccount,
  readAccountSession,
  registerAccount
} from "../lib/platform/accounts";
import {
  requestSessionToken,
  SESSION_COOKIE
} from "../lib/platform/account-boundary";
import { createSessionToken, hashSessionToken } from "../lib/platform/auth";
import { handleGoogleCallback } from "../lib/platform/google-boundary";
import { googleCookieName } from "../lib/platform/google-cookies";
import { GOOGLE_ISSUER } from "../lib/platform/google-provider";
import { accountConfig } from "../lib/platform/account-config";

const origin = process.env.ACCOUNT_ORIGIN!;
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(Boolean(process.env.VERCEL), false);
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
const database = new URL(process.env.DATABASE_URL!);
assert.equal(database.hostname, "127.0.0.1");
assert.equal(database.pathname, "/godschurches_security_test");
const db = new PrismaClient();
const ownerIds: string[] = [];
const attemptHashes: string[] = [];
const googleLimitKeys: string[] = [];
const httpLimitKeys = [
  "global",
  "ip:local",
  "list-sessions:anonymous",
  "revoke-other-sessions:anonymous"
].map((key) =>
  createHmac("sha256", accountConfig().rateSecret).update(key).digest("hex")
);
const password = "Fictional-session-rotation-password-1";
before(async () => {
  const [identity] = await db.$queryRaw<
    { database: string; address: string }[]
  >`SELECT current_database() AS database, host(inet_server_addr()) AS address`;
  assert.equal(identity.database, "godschurches_security_test");
  assert.equal(identity.address, "127.0.0.1");
});
// Like the account HTTPS suites, this file requires exclusive use of its
// fictional fixture. Keep resets within this server's limiter namespace;
// another worktree/server's counters and accounts remain untouched.
beforeEach(() =>
  db.platformAuthLimit.deleteMany({
    where: { key: { in: httpLimitKeys } }
  })
);
after(async () => {
  try {
    await db.platformAuthLimit.deleteMany({
      where: { key: { in: [...googleLimitKeys, ...httpLimitKeys] } }
    });
    await db.platformGoogleAttempt.deleteMany({
      where: { stateHash: { in: attemptHashes } }
    });
    await db.platformUser.deleteMany({ where: { id: { in: ownerIds } } });
    assert.equal(
      await db.platformUser.count({ where: { id: { in: ownerIds } } }),
      0
    );
  } finally {
    await db.$disconnect();
  }
});

async function actor() {
  const username = "rotation_" + randomBytes(7).toString("hex");
  await registerAccount(db, {
    username,
    name: "Fictional session rotation",
    email: username + "@example.test",
    role: "BELIEVER",
    password,
    confirmPassword: password
  });
  const user = await db.platformUser.findUniqueOrThrow({ where: { username } });
  ownerIds.push(user.id);
  const current = await loginAccount(
    db,
    user.email,
    password,
    "Current device"
  );
  const other = await loginAccount(db, user.email, password, "Other device");
  return { user, current, other };
}
const cookie = (token: string) => `${SESSION_COOKIE}=${token}`;
function post(body: object, cookies = "", extra: Record<string, string> = {}) {
  return fetch(origin + "/api/platform/account", {
    method: "POST",
    redirect: "manual",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookies,
      ...extra
    },
    body: JSON.stringify(body)
  });
}
const sessions = (ids: string[]) =>
  db.platformSession.findMany({
    where: { userId: { in: ids } },
    orderBy: { id: "asc" }
  });
function issuedToken(response: Response) {
  const entries = response.headers
    .getSetCookie()
    .filter((value) => value.startsWith(SESSION_COOKIE + "="));
  assert.equal(entries.length, 1);
  assert.match(entries[0], /; Path=\//);
  assert.match(entries[0], /; HttpOnly/);
  assert.match(entries[0], /; SameSite=Lax/);
  assert.match(entries[0], /; Secure(?:;|$)/);
  const token = entries[0].split(";")[0].slice(SESSION_COOKIE.length + 1);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  return token;
}
async function ownerAtHttp(token: string) {
  const response = await fetch(origin + "/api/platform/profile?view=identity", {
    headers: { Cookie: cookie(token) },
    redirect: "manual"
  });
  assert.equal(response.status, 200);
  return (await response.json()).id;
}
async function assertRetired(token: string) {
  assert.equal(
    await db.platformSession.findUnique({
      where: { tokenHash: hashSessionToken(token) }
    }),
    null
  );
  assert.equal(await readAccountSession(db, token), null);
  assert.equal(
    (await post({ operation: "list-sessions" }, cookie(token))).status,
    401
  );
  const page = await fetch(origin + "/platform/settings", {
    headers: { Cookie: cookie(token) },
    redirect: "manual"
  });
  assert.equal(page.status, 307);
  assert.equal(
    page.headers.get("location"),
    "/platform/join?next=%2Fplatform%2Fsettings&reason=settings"
  );
}

test("HTTPS successful re-login rotates only the browser session and rejects its old token immediately", async () => {
  const owner = await actor();
  const stranger = await actor();
  const before = await sessions([owner.user.id, stranger.user.id]);
  const response = await post(
    { operation: "login", email: owner.user.email, password },
    cookie(owner.current)
  );
  assert.equal(response.status, 200);
  const replacement = issuedToken(response);
  assert.notEqual(replacement, owner.current);
  assert.notEqual(replacement, owner.other);
  await assertRetired(owner.current);
  assert.equal(await ownerAtHttp(replacement), owner.user.id);
  assert.equal(await ownerAtHttp(owner.other), owner.user.id);
  assert.equal(await ownerAtHttp(stranger.current), stranger.user.id);
  const after = await sessions([owner.user.id, stranger.user.id]);
  assert.equal(after.length, before.length);
  assert.deepEqual(
    after.filter((row) => row.tokenHash !== hashSessionToken(replacement)),
    before.filter((row) => row.tokenHash !== hashSessionToken(owner.current))
  );
  assert.ok(!JSON.stringify(after).includes(replacement));
});

test("HTTPS failed login preserves both accounts; an explicit password account switch retires only the supplied old session", async () => {
  const previous = await actor();
  const next = await actor();
  const before = await sessions([previous.user.id, next.user.id]);
  for (const [candidate, headers] of [
    ["Wrong-fictional-password-1", {}],
    [password, { Origin: "https://foreign.example.test" }]
  ] as const) {
    const response = await post(
      { operation: "login", email: next.user.email, password: candidate },
      cookie(previous.current),
      headers
    );
    assert.ok(response.status >= 400 && response.status < 500);
    assert.equal(response.headers.get("set-cookie"), null);
    assert.deepEqual(await sessions([previous.user.id, next.user.id]), before);
  }
  const response = await post(
    { operation: "login", email: next.user.email, password },
    cookie(previous.current)
  );
  assert.equal(response.status, 200);
  const replacement = issuedToken(response);
  await assertRetired(previous.current);
  assert.equal(await ownerAtHttp(replacement), next.user.id);
  assert.equal(await ownerAtHttp(previous.other), previous.user.id);
  assert.equal(await ownerAtHttp(next.current), next.user.id);
  assert.deepEqual(
    (await sessions([previous.user.id, next.user.id])).filter(
      (row) => row.tokenHash !== hashSessionToken(replacement)
    ),
    before.filter((row) => row.tokenHash !== hashSessionToken(previous.current))
  );
});

const encodedCookie = (token: string) =>
  `${SESSION_COOKIE}=%${token.charCodeAt(0).toString(16)}${token.slice(1)}`;

test("ordinary session parsing rejects duplicates, including repeated identical values", () => {
  const a = createSessionToken();
  const b = createSessionToken();
  const read = (value: string) =>
    requestSessionToken(new Request(origin, { headers: { Cookie: value } }));
  assert.equal(read(`theme=light; ${cookie(a)}; unrelated=1`), a);
  for (const tokens of [
    [a, b],
    [b, a],
    [a, a],
    [a, ""],
    ["", a]
  ])
    assert.equal(read(tokens.map(cookie).join("; ")), undefined);
  for (const value of [
    encodedCookie(a),
    SESSION_COOKIE,
    `${SESSION_COOKIE} =${a}`,
    `${cookie(a)}; ${SESSION_COOKIE}`,
    `${SESSION_COOKIE}; ${cookie(a)}`,
    `${cookie(a)}; ${SESSION_COOKIE} =${b}`
  ])
    assert.equal(read(value), undefined);
});

test("HTTPS API and server-rendered settings reject duplicate principals in either order without leaking or revoking either account", async () => {
  const a = await actor();
  const b = await actor();
  const before = await sessions([a.user.id, b.user.id]);
  // Prove these fixtures work individually, so anonymous fallbacks cannot hide
  // an unavailable API, stale session or incorrectly configured server.
  assert.equal(await ownerAtHttp(a.current), a.user.id);
  assert.equal(await ownerAtHttp(b.current), b.user.id);
  const outcomes = [];
  const ambiguous = [
    ...[
      [a.current, b.current],
      [b.current, a.current],
      [a.current, a.current],
      [a.current, "invalid"],
      ["invalid", a.current]
    ].map((tokens) => tokens.map(cookie).join("; ")),
    encodedCookie(a.current),
    SESSION_COOKIE,
    `${SESSION_COOKIE} =${a.current}`,
    `${cookie(a.current)}; ${SESSION_COOKIE}`,
    `${SESSION_COOKIE}; ${cookie(a.current)}`,
    `${cookie(a.current)}; ${SESSION_COOKIE} =${b.current}`
  ];
  const guest = "/platform/join?next=%2Fplatform%2Fsettings&reason=settings";
  for (const [index, value] of ambiguous.entries()) {
    const headers = { Cookie: value };
    const api = await fetch(origin + "/api/platform/profile?view=identity", {
      headers,
      redirect: "manual"
    });
    const listing =
      index < 3
        ? await post({ operation: "list-sessions" }, headers.Cookie)
        : null;
    for (const rsc of [false, true]) {
      const ssr = await fetch(origin + "/platform/settings", {
        headers: { ...headers, ...(rsc ? { RSC: "1" } : {}) },
        redirect: "manual"
      });
      const body = await ssr.text();
      outcomes.push({
        api: api.status,
        listing: listing?.status ?? null,
        // Next may stream an RSC redirect after its response headers were sent.
        guestRedirect:
          (ssr.status === 307 && ssr.headers.get("location") === guest) ||
          (rsc &&
            ssr.status === 200 &&
            body.includes(`NEXT_REDIRECT;replace;${guest};307;`)),
        disclosed: [a.user.id, b.user.id, a.current, b.current].some((value) =>
          body.includes(value)
        )
      });
    }
    const privateBodies =
      (await api.text()) + (listing ? await listing.text() : "");
    if (api.status === 401 && (!listing || listing.status === 401))
      for (const value of [a.user.id, b.user.id, a.current, b.current])
        assert.ok(!privateBodies.includes(value));
  }
  assert.deepEqual(await sessions([a.user.id, b.user.id]), before);
  assert.deepEqual(
    outcomes,
    Array.from({ length: ambiguous.length * 2 }, (_, index) => ({
      api: 401,
      listing: index < 6 ? 401 : null,
      guestRedirect: true,
      disclosed: false
    }))
  );
});

test("HTTPS duplicate-cookie revocation cannot choose either account to mutate", async () => {
  const a = await actor();
  const b = await actor();
  const before = await sessions([a.user.id, b.user.id]);
  const outcomes = [];
  for (const tokens of [
    [a.current, b.current],
    [b.current, a.current]
  ]) {
    const response = await post(
      { operation: "revoke-other-sessions", currentPassword: password },
      tokens.map(cookie).join("; ")
    );
    outcomes.push({
      status: response.status,
      cookie: response.headers.get("set-cookie"),
      unchanged:
        JSON.stringify(await sessions([a.user.id, b.user.id])) ===
        JSON.stringify(before)
    });
  }
  assert.deepEqual(outcomes, [
    { status: 401, cookie: null, unchanged: true },
    { status: 401, cookie: null, unchanged: true }
  ]);
});

async function googleAttempt(owner: Awaited<ReturnType<typeof actor>>) {
  const browser = createSessionToken();
  const state = createSessionToken();
  const nonceHash = hashSessionToken(createSessionToken());
  const subject = "fictional-rotation-" + randomBytes(8).toString("hex");
  // This trusted callback runs in this test process, so its limiter can use an
  // owned namespace without resetting the HTTP server's shared counters.
  const rateSecret = randomBytes(32).toString("hex");
  for (const key of ["global", "ip:local", `google-callback:${browser}`])
    googleLimitKeys.push(
      createHmac("sha256", rateSecret).update(key).digest("hex")
    );
  await db.platformGoogleIdentity.create({
    data: { userId: owner.user.id, issuer: GOOGLE_ISSUER, subject }
  });
  const stateHash = hashSessionToken(state);
  attemptHashes.push(stateHash);
  await db.platformGoogleAttempt.create({
    data: {
      stateHash,
      browserHash: hashSessionToken(browser),
      nonceHash,
      expiresAt: new Date(Date.now() + 600_000),
      returnTo: "/platform/settings"
    }
  });
  let exchanges = 0;
  return {
    stateHash,
    count: () => exchanges,
    callback: async (token: string, extraCookies = "") => {
      const keys = [
        "ACCOUNT_GOOGLE_ENABLED",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
        "AUTH_RATE_LIMIT_SECRET"
      ] as const;
      const previous = keys.map((key) => process.env[key]);
      try {
        process.env.ACCOUNT_GOOGLE_ENABLED = "true";
        process.env.GOOGLE_CLIENT_ID = "rotation.apps.googleusercontent.com";
        process.env.GOOGLE_CLIENT_SECRET = "fictional-rotation-client-secret";
        process.env.AUTH_RATE_LIMIT_SECRET = rateSecret;
        return await handleGoogleCallback(
          db,
          new Request(
            origin +
              "/api/platform/google/callback?state=" +
              state +
              "&code=fictional-code",
            {
              headers: {
                Cookie: `${googleCookieName("browser", true)}=${browser}; ${cookie(token)}${extraCookies}`
              }
            }
          ),
          async (_config, code, _verifier, expectedNonceHash) => {
            // Trusted verifier seam: no Google network request. The existing
            // Google verifier suites separately exercise signed token claims.
            exchanges++;
            assert.equal(code, "fictional-code");
            assert.equal(expectedNonceHash, nonceHash);
            return {
              issuer: GOOGLE_ISSUER,
              subject,
              email: owner.user.email,
              emailAuthoritative: true
            };
          }
        );
      } finally {
        for (const [index, key] of keys.entries()) {
          if (previous[index] === undefined) delete process.env[key];
          else process.env[key] = previous[index];
        }
      }
    }
  };
}

test("Google callback replaces an expired cookie, preserving other devices and consuming its browser-bound attempt once", async () => {
  const previous = await actor();
  const next = await actor();
  await db.platformSession.update({
    where: { tokenHash: hashSessionToken(previous.current) },
    data: { expiresAt: new Date(0) }
  });
  const attempt = await googleAttempt(next);
  const before = await sessions([previous.user.id, next.user.id]);
  const response = await attempt.callback(previous.current);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/platform/settings");
  assert.equal(attempt.count(), 1);
  const replacement = issuedToken(response);
  await assertRetired(previous.current);
  assert.equal(await ownerAtHttp(replacement), next.user.id);
  const after = await sessions([previous.user.id, next.user.id]);
  assert.deepEqual(
    after.filter((row) => row.tokenHash !== hashSessionToken(replacement)),
    before.filter((row) => row.tokenHash !== hashSessionToken(previous.current))
  );
  const replay = await attempt.callback(previous.current);
  assert.equal(
    replay.headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  assert.equal(replay.headers.get("set-cookie"), null);
  assert.equal(attempt.count(), 1);
  assert.deepEqual(await sessions([previous.user.id, next.user.id]), after);
});

test("Google anonymous login cannot replace an account signed in during its redirect", async () => {
  const previous = await actor();
  const next = await actor();
  const attempt = await googleAttempt(next);
  const before = await sessions([previous.user.id, next.user.id]);
  const response = await attempt.callback(previous.current);
  assert.equal(response.status, 303);
  assert.equal(
    response.headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(attempt.count(), 0);
  assert.deepEqual(await sessions([previous.user.id, next.user.id]), before);
  assert.equal(
    (
      await db.platformGoogleAttempt.findUniqueOrThrow({
        where: { stateHash: attempt.stateHash }
      })
    ).consumedAt,
    null
  );
  assert.equal(await ownerAtHttp(previous.current), previous.user.id);
});

test("Google callback cannot treat conflicting active cookies as an anonymous browser", async () => {
  const previous = await actor();
  const next = await actor();
  const attempt = await googleAttempt(next);
  const before = await sessions([previous.user.id, next.user.id]);
  const response = await attempt.callback(
    previous.current,
    `; ${cookie(next.current)}`
  );
  assert.equal(
    response.headers.get("location"),
    "/platform/login?notice=google-retry"
  );
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(attempt.count(), 0);
  assert.deepEqual(await sessions([previous.user.id, next.user.id]), before);
  assert.equal(
    (
      await db.platformGoogleAttempt.findUniqueOrThrow({
        where: { stateHash: attempt.stateHash }
      })
    ).consumedAt,
    null
  );
});
