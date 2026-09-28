import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { assertPortalTestDatabase } from "./seed-portal";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { accountConfig } from "../lib/platform/account-config";
import { ADULT_POLICY } from "../lib/platform/portal-types";
import { PortalError } from "../lib/platform/portal-policy";
import { privilegedMode } from "../lib/platform/privileged-auth-policy";
import { handleTopicRequest } from "../lib/platform/topic-boundary";
import { retentionTestStore } from "../lib/platform/retention-test-store";
import {
  socialRequest,
  SocialClientError
} from "../lib/platform/social-client";

const db = new PrismaClient();
const rejected = "TOPIC_INPUT_REJECTED";
before(async () => {
  await assertPortalTestDatabase(db);
  assert.notEqual(
    privilegedMode(),
    "enforce",
    "Use the ordinary isolated service fixture; enforced MFA has its separate acceptance suite"
  );
  assert.ok(
    retentionTestStore("retention-v1/controls/"),
    "Use the existing isolated RETENTION_TEST_DIR, never a provider journal"
  );
});
after(() => db.$disconnect());

async function actor() {
  const username = `tr_${randomBytes(7).toString("hex")}`;
  const email = `${username}@example.test`;
  const password = `Fictional-only-${randomBytes(16).toString("hex")}`;
  const created = await registerAccount(db, {
    name: "Fictional topic response",
    username,
    email,
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  assert.ok(created);
  // Fictional prerequisite facts affect only this newly created actor.
  // No other actor, shared abuse budget, delivery or operator grant is changed.
  await db.platformUser.update({
    where: { id: created.id },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }
  });
  const token = await loginAccount(db, email, password, "topic-response-test");
  return { id: created.id, token };
}
type Actor = Awaited<ReturnType<typeof actor>>;
function input() {
  const tag = randomUUID();
  return {
    operation: "create",
    mutationId: randomUUID(),
    name: `Fictional response ${tag}`,
    slug: `response-${tag}`,
    description: "An isolated fictional topic response test.",
    rules: "Keep the discussion respectful and protect private information.",
    acceptedRules: true
  };
}
function request(owner: Actor, body?: string, path = "/api/platform/topics") {
  const origin = accountConfig().origin;
  return new Request(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: `${sessionCookieFixtureName(origin)}=${owner.token}`,
      "X-Expected-Account": owner.id
    },
    ...(body === undefined ? {} : { body })
  });
}
function post(owner: Actor, body: Record<string, unknown>, client = db) {
  return handleTopicRequest(client, request(owner, JSON.stringify(body)));
}
async function state(owner: Actor) {
  return {
    topics: await db.topicCommunity.findMany({
      where: { creatorId: owner.id },
      orderBy: { id: "asc" }
    }),
    memberships: await db.topicMembership.findMany({
      where: { userId: owner.id },
      orderBy: { id: "asc" }
    }),
    audit: await db.topicAudit.findMany({
      where: { actorId: owner.id },
      orderBy: { id: "asc" }
    }),
    receipts: await db.socialOperation.findMany({
      where: { ownerId: owner.id, key: { startsWith: "topic:" } },
      orderBy: { key: "asc" }
    })
  };
}
async function assertRejected(response: Response) {
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("X-Topic-Code"), rejected);
  assert.equal((await response.json()).code, rejected);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(response.headers.get("set-cookie"), null);
}

test("malformed topic input is explicitly rejected without topic, membership, audit or receipt writes", async () => {
  const owner = await actor();
  const before = await state(owner);
  assert.deepEqual(before, {
    topics: [],
    memberships: [],
    audit: [],
    receipts: []
  });
  for (const raw of [
    "{",
    "[]",
    JSON.stringify({ ...input(), description: "x".repeat(33000) })
  ]) {
    await assertRejected(await handleTopicRequest(db, request(owner, raw)));
    assert.deepEqual(await state(owner), before);
  }
});

test("transactional topic validation rejects unsupported fields and invalid values without committing any topic effect", async () => {
  const owner = await actor();
  const before = await state(owner);
  const command = input();
  for (const invalid of [
    { ...command, ownerId: "forged-owner" },
    { ...command, name: "x" },
    { ...command, acceptedRules: false }
  ]) {
    await assertRejected(await post(owner, invalid));
    assert.deepEqual(await state(owner), before);
  }
});

test("an outer topic read error is not a command-rejection classification", async () => {
  const owner = await actor();
  const before = await state(owner);
  const response = await handleTopicRequest(
    db,
    request(owner, undefined, "/api/platform/topics?view=unsupported")
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("X-Topic-Code"), null);
  assert.notEqual((await response.json()).code, rejected);
  assert.deepEqual(await state(owner), before);
});

test("committed exact topic replay returns its original receipt once, while real key conflicts and lost permission remain authoritative", async () => {
  const owner = await actor();
  const command = input();
  const first = await post(owner, command);
  assert.ok([200, 202].includes(first.status));
  const receipt = await first.json();
  const committed = await state(owner);
  assert.equal(committed.topics.length, 1);
  assert.equal(committed.memberships.length, 1);
  assert.equal(committed.audit.length, 1);
  assert.equal(committed.audit[0].action, "CREATED");
  assert.equal(committed.receipts.length, 1);
  assert.equal(committed.receipts[0].key, `topic:${command.mutationId}`);
  assert.equal(committed.topics[0].id, receipt.id);
  assert.equal(committed.topics[0].version, receipt.version);
  const replay = await post(owner, command);
  assert.ok([200, 202].includes(replay.status));
  assert.equal(replay.headers.get("X-Topic-Code"), null);
  const replayed = await replay.json();
  assert.equal(replayed.id, receipt.id);
  assert.equal(replayed.version, receipt.version);
  assert.deepEqual(await state(owner), committed);

  const conflict = await post(owner, {
    ...command,
    description: "Changed bytes under the original key"
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.headers.get("X-Topic-Code"), null);
  assert.notEqual((await conflict.json()).code, rejected);
  assert.deepEqual(await state(owner), committed);

  await db.platformUser.update({
    where: { id: owner.id },
    data: { emailVerifiedAt: null }
  });
  const denied = await post(owner, command);
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("X-Topic-Code"), null);
  assert.notEqual((await denied.json()).code, rejected);
  assert.deepEqual(await state(owner), committed);
});

test("a journal failure after a real topic commit returns an accepted 202 receipt, never input rejection", async () => {
  const owner = await actor();
  const command = input();
  let journalAttempts = 0;
  const controls = new Proxy(db.retentionControl, {
    get(target, key) {
      if (key === "findMany")
        return async () => {
          const committed = await state(owner);
          assert.equal(committed.topics.length, 1);
          assert.equal(committed.audit.length, 1);
          assert.equal(
            committed.receipts[0]?.key,
            `topic:${command.mutationId}`
          );
          journalAttempts++;
          // Intentionally a 400: classification must depend on the precommit
          // command boundary, not on a later error having the same HTTP status.
          throw new PortalError(
            400,
            "Fictional post-commit journal read failure"
          );
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const failingJournal = new Proxy(db, {
    get(target, key) {
      if (key === "retentionControl") return controls;
      const value = Reflect.get(target, key);
      // Transaction callbacks use the actual client. Only the later journal
      // query is interrupted; the command and receipt both commit normally.
      return typeof value === "function" ? value.bind(target) : value;
    }
  });
  const response = await post(owner, command, failingJournal);
  assert.equal(journalAttempts, 1);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get("X-Topic-Code"), null);
  const receipt = await response.json();
  assert.notEqual(receipt.code, rejected);
  assert.match(receipt.message, /Protected recovery is pending/);
  const committed = await state(owner);
  assert.equal(committed.topics[0].id, receipt.id);
  assert.equal(committed.topics[0].version, receipt.version);
  const replay = await post(owner, command);
  assert.ok([200, 202].includes(replay.status));
  assert.equal((await replay.json()).id, receipt.id);
  assert.deepEqual(await state(owner), committed);
});

test("a preflight identity 400 cannot forward a forged topic-rejection code or send the command", async (t) => {
  const calls: string[] = [];
  let dispatches = 0;
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return Response.json(
        { message: "Fictional identity denial", code: rejected },
        { status: 400, headers: { "X-Topic-Code": rejected } }
      );
    }
  );
  try {
    await assert.rejects(
      socialRequest(
        "/api/platform/topics",
        JSON.stringify(input()),
        "original-owner",
        "POST",
        () => {
          dispatches++;
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof SocialClientError);
        assert.equal(error.status, 400);
        assert.equal(error.code, undefined);
        return true;
      }
    );
    assert.deepEqual(calls, ["/api/platform/profile?view=identity"]);
    assert.equal(dispatches, 0);
  } finally {
    mocked.mock.restore();
  }
});

test("an identity 400 after an accepted command remains unclassified uncertainty", async (t) => {
  const calls: string[] = [];
  let dispatches = 0;
  let identities = 0;
  const body = JSON.stringify(input());
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      calls.push(path);
      if (path.includes("view=identity")) {
        identities++;
        return identities === 1
          ? Response.json({ id: "original-owner" })
          : Response.json(
              { code: rejected, message: "Fictional late identity error" },
              { status: 400 }
            );
      }
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, body);
      return Response.json({
        id: "committed-topic",
        version: 1,
        message: "Saved"
      });
    }
  );
  try {
    await assert.rejects(
      socialRequest(
        "/api/platform/topics",
        body,
        "original-owner",
        "POST",
        () => {
          dispatches++;
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof SocialClientError);
        assert.equal(error.status, 400);
        assert.equal(error.code, undefined);
        return true;
      }
    );
    assert.equal(dispatches, 1);
    assert.deepEqual(calls, [
      "/api/platform/profile?view=identity",
      "/api/platform/topics",
      "/api/platform/profile?view=identity"
    ]);
  } finally {
    mocked.mock.restore();
  }
});

test("an actual tagged command rejection forwards its code only after same-owner confirmation", async (t) => {
  const calls: string[] = [];
  let dispatches = 0;
  const body = JSON.stringify(input());
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = String(url);
      calls.push(path);
      if (path.includes("view=identity"))
        return Response.json({ id: "original-owner" });
      assert.equal(init?.method, "POST");
      assert.equal(init?.body, body);
      assert.equal(
        new Headers(init?.headers).get("X-Expected-Account"),
        "original-owner"
      );
      return Response.json(
        { code: rejected, message: "Correct the topic fields" },
        { status: 400, headers: { "X-Topic-Code": rejected } }
      );
    }
  );
  try {
    await assert.rejects(
      socialRequest(
        "/api/platform/topics",
        body,
        "original-owner",
        "POST",
        () => {
          dispatches++;
        }
      ),
      (error: unknown) => {
        assert.ok(error instanceof SocialClientError);
        assert.equal(error.status, 400);
        assert.equal(error.code, rejected);
        assert.equal(error.message, "Correct the topic fields");
        return true;
      }
    );
    assert.equal(dispatches, 1);
    assert.deepEqual(calls, [
      "/api/platform/profile?view=identity",
      "/api/platform/topics",
      "/api/platform/profile?view=identity"
    ]);
  } finally {
    mocked.mock.restore();
  }
});

test("account replacement takes precedence over a tagged command rejection", async (t) => {
  let identities = 0,
    commands = 0;
  const mocked = t.mock.method(
    globalThis,
    "fetch",
    async (url: RequestInfo | URL) => {
      if (String(url).includes("view=identity")) {
        identities++;
        return Response.json({
          id: identities === 1 ? "original-owner" : "replacement-owner"
        });
      }
      commands++;
      return Response.json(
        { code: rejected, message: "Correct the fields" },
        { status: 400 }
      );
    }
  );
  try {
    await assert.rejects(
      socialRequest(
        "/api/platform/topics",
        JSON.stringify(input()),
        "original-owner"
      ),
      (error: unknown) => {
        assert.ok(error instanceof SocialClientError);
        assert.equal(error.status, 401);
        assert.equal(error.code, undefined);
        return true;
      }
    );
    assert.equal(identities, 2);
    assert.equal(commands, 1);
  } finally {
    mocked.mock.restore();
  }
});
