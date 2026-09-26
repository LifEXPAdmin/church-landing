import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  allowAccountAttempt,
  allowWorkspaceAttempt
} from "../lib/platform/account-limits";
import { handleAccountRequest } from "../lib/platform/account-boundary";
import { accountConfig } from "../lib/platform/account-config";

const clients = [new PrismaClient(), new PrismaClient()];
const db = clients[0];
before(async () => {
  for (const client of clients) await assertPortalTestDatabase(client);
});
after(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
});
const hash = (secret: string, value: string) =>
  createHmac("sha256", secret).update(value).digest("hex");
const request = (
  body: Record<string, unknown>,
  extra: Record<string, string> = {}
) =>
  new Request(accountConfig().origin + "/api/platform/account", {
    method: "POST",
    headers: {
      origin: accountConfig().origin,
      "content-type": "application/json",
      ...extra
    },
    body: JSON.stringify(body)
  });

test("independent connections share account and reset ceilings and recover after expiry", async () => {
  for (const [operation, maximum] of [
    ["login", 10],
    ["request-reset", 3]
  ] as const) {
    const secret = randomUUID(),
      subject = randomUUID(),
      ip = randomUUID();
    const outcomes = await Promise.all(
      Array.from({ length: maximum + 5 }, (_, index) =>
        allowAccountAttempt(clients[index % 2], secret, operation, ip, subject)
      )
    );
    assert.equal(outcomes.filter(Boolean).length, maximum);
    assert.equal(
      await allowAccountAttempt(
        clients[1],
        secret,
        operation,
        ip + "another",
        subject
      ),
      false
    );
    const key = hash(secret, `${operation}:${subject}`);
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      maximum + 1
    );
    await db.platformAuthLimit.update({
      where: { key },
      data: { expiresAt: new Date(0) }
    });
    assert.equal(
      await allowAccountAttempt(clients[1], secret, operation, ip, subject),
      true
    );
    assert.equal(
      (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
      1
    );
  }
});

test("network and global account admission remain shared when subjects and connections change", async () => {
  const networkSecret = randomUUID(),
    network = randomUUID();
  const networkOutcomes = await Promise.all(
    Array.from({ length: 35 }, (_, i) =>
      allowAccountAttempt(
        clients[i % 2],
        networkSecret,
        "login",
        network,
        randomUUID()
      )
    )
  );
  assert.equal(networkOutcomes.filter(Boolean).length, 30);
  const globalSecret = randomUUID();
  const globalOutcomes = await Promise.all(
    Array.from({ length: 125 }, (_, i) =>
      allowAccountAttempt(
        clients[i % 2],
        globalSecret,
        "login",
        randomUUID(),
        randomUUID()
      )
    )
  );
  assert.equal(globalOutcomes.filter(Boolean).length, 120);
  assert.equal(
    (
      await db.platformAuthLimit.findUniqueOrThrow({
        where: { key: hash(globalSecret, "global") }
      })
    ).hits,
    121
  );
});

test("workspace transport budgets span database connections but remain scoped to the account and domain", async () => {
  const secret = randomUUID(),
    owner = randomUUID();
  assert.equal(await allowWorkspaceAttempt(db, secret, owner), true);
  const key = hash(secret, `post-workspace:${owner}`);
  await db.platformAuthLimit.update({ where: { key }, data: { hits: 239 } });
  const decisions = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      allowWorkspaceAttempt(clients[i % 2], secret, owner)
    )
  );
  assert.equal(decisions.filter(Boolean).length, 1);
  assert.equal(
    await allowWorkspaceAttempt(clients[1], secret, randomUUID()),
    true
  );
  assert.equal(
    await allowWorkspaceAttempt(clients[1], secret + ":other-domain", owner),
    true
  );
});

test("signup handler shares its normalized address budget and refuses the next request without creating an account", async () => {
  await db.platformAuthLimit.deleteMany();
  const email = `p_budget_${randomUUID().slice(0, 8)}@example.test`;
  const body = {
    operation: "register",
    name: "Fictional budget test",
    username: "budget_" + randomUUID().slice(0, 8),
    email,
    password: "short",
    confirmPassword: "short",
    role: "BELIEVER"
  };
  for (let i = 0; i < 11; i++) {
    const response = await handleAccountRequest(
      clients[i % 2],
      request({ ...body, email: i % 2 ? email.toUpperCase() : email })
    );
    assert.equal(response.status, i < 10 ? 400 : 429);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Retry-After"), i < 10 ? null : "900");
  }
  assert.equal(await db.platformUser.count({ where: { email } }), 0);
});

test("password reset keeps the same public response while shared throttling bounds local delivery", async () => {
  const actor = await createPortalActor(db, "budgetreset");
  const config = accountConfig();
  assert.equal(config.delivery, "test-sink");
  assert.ok(config.sinkDirectory);
  await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
  async function resetDeliveries() {
    const files = await readdir(config.sinkDirectory!);
    const deliveries = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .map(async (file) =>
          JSON.parse(await readFile(join(config.sinkDirectory!, file), "utf8"))
        )
    );
    return deliveries.filter(
      (delivery) =>
        delivery.email === actor.email && delivery.purpose === "RESET_PASSWORD"
    ).length;
  }
  const deliveriesBefore = await resetDeliveries();
  const before = await db.platformAccountGrant.count({
    where: { userId: actor.id, purpose: "RESET_PASSWORD" }
  });
  const bodies: unknown[] = [];
  for (let i = 0; i < 5; i++) {
    const response = await handleAccountRequest(
      clients[i % 2],
      request({
        operation: "request-reset",
        email: i % 2 ? actor.email.toUpperCase() : actor.email
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Retry-After"), null);
    bodies.push(await response.json());
  }
  assert.ok(
    bodies.every((body) => JSON.stringify(body) === JSON.stringify(bodies[0]))
  );
  assert.equal(
    (await db.platformAccountGrant.count({
      where: { userId: actor.id, purpose: "RESET_PASSWORD" }
    })) - before,
    3
  );
  assert.equal((await resetDeliveries()) - deliveriesBefore, 3);
  const absent = await handleAccountRequest(
    clients[1],
    request({
      operation: "request-reset",
      email: `absent_${randomUUID()}@example.test`
    })
  );
  assert.equal(absent.status, 200);
  assert.deepEqual(await absent.json(), bodies[0]);
});

test("off-platform forwarded addresses cannot bypass the shared account network budget", async () => {
  assert.equal(process.env.VERCEL || "", "");
  await db.platformAuthLimit.deleteMany();
  for (let i = 0; i < 31; i++) {
    const response = await handleAccountRequest(
      clients[i % 2],
      request(
        {
          operation: "register",
          email: `budget_${randomUUID()}@example.test`,
          password: "short"
        },
        {
          "x-forwarded-for": `192.0.2.${i + 1}`,
          "x-real-ip": `198.51.100.${i + 1}`
        }
      )
    );
    assert.equal(response.status, i < 30 ? 400 : 429);
  }
});

test("oversized streamed account payload is canceled before admission or canonical writes", async () => {
  const before = {
    limits: await db.platformAuthLimit.count(),
    users: await db.platformUser.count(),
    grants: await db.platformAccountGrant.count()
  };
  let canceled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        controller.enqueue(new Uint8Array(32769));
      },
      cancel() {
        canceled = true;
      }
    },
    { highWaterMark: 0 }
  );
  const response = await handleAccountRequest(
    db,
    new Request(accountConfig().origin + "/api/platform/account", {
      method: "POST",
      headers: {
        origin: accountConfig().origin,
        "content-type": "application/json"
      },
      body,
      duplex: "half"
    } as RequestInit)
  );
  assert.equal(response.status, 400);
  assert.equal(canceled, true);
  assert.equal(response.headers.get("Retry-After"), null);
  assert.deepEqual(
    {
      limits: await db.platformAuthLimit.count(),
      users: await db.platformUser.count(),
      grants: await db.platformAccountGrant.count()
    },
    before
  );
});
