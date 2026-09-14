import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import {
  allowAccountAttempt,
  allowImageAttempt
} from "../lib/platform/account-limits";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("distinct image owners sharing Wi-Fi do not consume sign-in allowance; the account limit remains ten", async () => {
  const secret = randomUUID(),
    ip = "fictional-shared-wifi",
    owner = randomUUID();
  for (let i = 0; i < 31; i++)
    assert.equal(
      await allowImageAttempt(db, secret, "upload", ip, randomUUID()),
      true
    );
  for (let i = 0; i < 30; i++)
    assert.equal(
      await allowAccountAttempt(db, secret, "signin", ip, randomUUID()),
      true
    );
  assert.equal(
    await allowAccountAttempt(db, secret, "signin", ip, randomUUID()),
    false
  );
  for (let i = 0; i < 10; i++)
    assert.equal(
      await allowImageAttempt(db, secret, "upload", ip, owner),
      true
    );
  assert.equal(await allowImageAttempt(db, secret, "upload", ip, owner), false);
  const keys = await db.platformAuthLimit.findMany({
    where: {
      key: {
        in: [
          createHmac("sha256", secret + ":images")
            .update(`ip:${ip}`)
            .digest("hex")
        ]
      }
    },
    select: { key: true, hits: true }
  });
  assert.equal(keys.length, 1);
  assert.ok(!keys[0].key.includes(ip));
});

test("concurrent image admission retains the global 120-per-minute budget and bounded 300-per-network window", async () => {
  const secret = randomUUID(),
    ip = "fictional-capacity-network";
  const key = (value: string) =>
    createHmac("sha256", secret + ":images")
      .update(value)
      .digest("hex");
  const decisions = await Promise.all(
    Array.from({ length: 125 }, () =>
      allowImageAttempt(db, secret, "upload", ip, randomUUID())
    )
  );
  assert.equal(decisions.filter(Boolean).length, 120);
  // Advance only this fixture's minute clock; the shared-network window remains.
  await db.platformAuthLimit.update({
    where: { key: key("global") },
    data: { expiresAt: new Date(0) }
  });
  await db.platformAuthLimit.update({
    where: { key: key(`ip:${ip}`) },
    data: { hits: 299 }
  });
  assert.equal(
    await allowImageAttempt(db, secret, "upload", ip, randomUUID()),
    true
  );
  assert.equal(
    await allowImageAttempt(db, secret, "upload", ip, randomUUID()),
    false
  );
});
