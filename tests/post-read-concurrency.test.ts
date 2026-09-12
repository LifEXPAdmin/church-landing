import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { withPostRead } from "../lib/platform/post-access";
const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
test("independent readers overlap while a revocation writer waits for both", async () => {
  const firstEntered = deferred(),
    secondEntered = deferred(),
    release = deferred(),
    writerEntered = deferred();
  const first = withPostRead(db, "", async () => {
    firstEntered.resolve();
    await release.promise;
  });
  await firstEntered.promise;
  const second = withPostRead(db, "", async () => {
    secondEntered.resolve();
    await release.promise;
  });
  try {
    // A bounded timeout catches accidental reintroduction of an exclusive read gate.
    await Promise.race([
      secondEntered.promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(Error("Readers serialized")), 1500).unref()
      )
    ]);
    let acquired = false;
    const writer = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      acquired = true;
      writerEntered.resolve();
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(acquired, false);
    release.resolve();
    await Promise.all([first, second, writer, writerEntered.promise]);
  } finally {
    release.resolve();
    await Promise.allSettled([first, second]);
  }
});
test("read callbacks cannot write and readers wait for permission writers", async () => {
  await assert.rejects(
    withPostRead(db, "", (tx) =>
      tx.platformPostLike.deleteMany({ where: { id: "missing-fictional-row" } })
    ),
    /read-only transaction/
  );
  const entered = deferred(),
    release = deferred();
  let readEntered = false;
  const writer = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const reader = withPostRead(db, "", async () => {
    readEntered = true;
  });
  try {
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(readEntered, false);
  } finally {
    release.resolve();
    await Promise.all([writer, reader]);
  }
  assert.equal(readEntered, true);
});
