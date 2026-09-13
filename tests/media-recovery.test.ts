import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { imageStorage } from "../lib/platform/media-storage";
import {
  listImages,
  readImage,
  uploadImage,
  collectImageGarbage
} from "../lib/platform/media";
import { PortalError } from "../lib/platform/portal-policy";
import { personalPhotoCommand } from "../lib/platform/personal-photos";
import { relationshipCommand } from "../lib/platform/relationships";

const db = new PrismaClient();
const envNames = [
  "MEDIA_STORAGE_MODE",
  "MEDIA_TEST_DIR",
  "PERSONAL_PHOTO_LIBRARY_ENABLED"
];
const prior = Object.fromEntries(
  envNames.map((key) => [key, process.env[key]])
);
let directory: string, bytes: Buffer;
type Reply = {
  result?: { id?: string; removed?: number };
  puts?: number;
  error?: { code: string; status: number | null };
};
const children = new Map<ChildProcess, Promise<unknown>>();
function worker(input: object) {
  const child = fork(
    new URL("./media-recovery-worker.ts", import.meta.url),
    [JSON.stringify(input)],
    {
      execArgv: ["--import", new URL("./register.mjs", import.meta.url).href],
      env: { ...process.env },
      stdio: ["ignore", "ignore", "inherit", "ipc"]
    }
  );
  let reply: Reply | undefined,
    timedOut = false;
  const phase = Promise.withResolvers<void>();
  child.on("message", (message) => {
    if ((message as { phase?: string }).phase) phase.resolve();
    else reply = message as Reply;
  });
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, 15000);
  const finished = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      resolve({ code, signal });
    });
  });
  children.set(child, finished);
  return {
    phase: () =>
      Promise.race([
        phase.promise,
        finished.then(() => {
          throw Error("Media worker exited before interruption point");
        })
      ]),
    resume: () => child.send({ resume: true }),
    kill: async () => {
      child.kill("SIGKILL");
      assert.equal((await finished).signal, "SIGKILL");
      assert.equal(timedOut, false);
    },
    result: async () => {
      assert.equal((await finished).code, 0);
      assert.equal(timedOut, false);
      assert.ok(reply);
      return reply;
    }
  };
}
before(async () => {
  await assertPortalTestDatabase(db);
  directory = await mkdtemp(resolve(".account-test/media-recovery-"));
  Object.assign(process.env, {
    MEDIA_STORAGE_MODE: "local-test",
    MEDIA_TEST_DIR: directory,
    PERSONAL_PHOTO_LIBRARY_ENABLED: "true"
  });
  bytes = await sharp({
    create: { width: 24, height: 16, channels: 3, background: "teal" }
  })
    .png()
    .toBuffer();
});
afterEach(async () => {
  const active = [...children];
  active.forEach(([child]) => child.kill("SIGKILL"));
  await Promise.all(active.map(([, finished]) => finished));
});
after(async () => {
  await db.$disconnect();
  if (directory) await rm(directory, { recursive: true, force: true });
  for (const key of envNames)
    if (prior[key] === undefined) delete process.env[key];
    else process.env[key] = prior[key];
});
const command = (id: string, fields = {}) => ({
  purpose: "PROFILE_AVATAR",
  targetId: id,
  requestKey: randomUUID(),
  ...fields
});
const asset = (id: string) =>
  db.mediaAsset.findUniqueOrThrow({ where: { id } });
const file = (prefix: string, variant = "original") =>
  join(directory, prefix, variant + ".webp");
const denied = (promise: Promise<unknown>, status: number) =>
  assert.rejects(
    promise,
    (error: unknown) => error instanceof PortalError && error.status === status
  );
async function uploadFixture() {
  const owner = await createPortalActor(db, "mediacrash");
  const input = command(owner.id);
  return {
    owner,
    input,
    job: {
      operation: "upload",
      mode: "normal",
      token: owner.token,
      command: input,
      bytes: bytes.toString("base64")
    }
  };
}
async function expire(id: string) {
  await db.mediaAsset.update({
    where: { id },
    data: { leaseUntil: new Date(0) }
  });
}
async function due(prefix: string) {
  await db.mediaGarbage.upsert({
    where: { storagePrefix: prefix },
    create: { storagePrefix: prefix, dueAt: new Date(-1000) },
    update: { dueAt: new Date(-1000) }
  });
}
async function canonical(id: string, ownerId: string, requestKey: string) {
  assert.equal(
    await db.mediaAsset.count({ where: { uploaderId: ownerId, requestKey } }),
    1
  );
  assert.equal(
    await db.personalPhoto.count({ where: { assetId: id, deletedAt: null } }),
    1
  );
}

for (const mode of ["first-put", "last-put"])
  test(`real process death after ${mode} keeps the prior photo and recovers one immutable asset after its lease expires`, async () => {
    const f = await uploadFixture();
    const original = await uploadImage(db, f.owner.token, f.input, bytes);
    const replacement = command(f.owner.id, { replacesId: original.id });
    const job = { ...f.job, command: replacement };
    const interrupted = worker({ ...job, mode });
    await interrupted.phase();
    const pending = await db.mediaAsset.findUniqueOrThrow({
      where: {
        uploaderId_requestKey: {
          uploaderId: f.owner.id,
          requestKey: replacement.requestKey
        }
      }
    });
    assert.equal(pending.status, "UPLOADING");
    assert.ok(
      await db.mediaGarbage.findUnique({
        where: { storagePrefix: pending.storagePrefix }
      })
    );
    await interrupted.kill();
    assert.equal(
      (await listImages(db, f.owner.token, "PROFILE_AVATAR", f.owner.id))[0].id,
      original.id
    );
    const leased = await worker(job).result();
    assert.equal(leased.error?.status, 409);
    await expire(pending.id);
    const recovered = await worker(job).result();
    assert.equal(recovered.error, undefined);
    assert.equal(recovered.result?.id, pending.id);
    assert.equal(recovered.puts, 4);
    const current = await asset(pending.id);
    assert.notEqual(current.storagePrefix, pending.storagePrefix);
    assert.equal(
      (await listImages(db, f.owner.token, "PROFILE_AVATAR", f.owner.id))[0].id,
      current.id
    );
    await canonical(current.id, f.owner.id, replacement.requestKey);
    await due(pending.storagePrefix);
    assert.deepEqual(
      await worker({
        operation: "cleanup",
        mode: "normal",
        now: new Date(-100).toISOString()
      }).result(),
      { result: { removed: 1 }, puts: 0 }
    );
    await assert.rejects(readFile(file(pending.storagePrefix)), {
      code: "ENOENT"
    });
    assert.ok(
      (await readImage(db, f.owner.token, original.id, "thumb")).length
    );
    assert.ok((await readImage(db, f.owner.token, current.id, "thumb")).length);
  });

test("lost upload acknowledgement after the ready commit never uploads bytes twice or duplicates retained history", async () => {
  const f = await uploadFixture();
  const interrupted = worker({ ...f.job, mode: "committed" });
  await interrupted.phase();
  const ready = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.owner.id,
        requestKey: f.input.requestKey
      }
    }
  });
  assert.equal(ready.status, "READY");
  await interrupted.kill();
  const retry = await worker(f.job).result();
  assert.equal(retry.result?.id, ready.id);
  assert.equal(retry.puts, 0);
  await canonical(ready.id, f.owner.id, f.input.requestKey);
  const changed = await worker({
    ...f.job,
    command: { ...f.input, caption: "Different body" }
  }).result();
  assert.equal(changed.error?.status, 409);
  assert.ok((await readImage(db, f.owner.token, ready.id, "original")).length);
});

test("cleanup process death after provider deletion retains its ledger and a duplicate worker safely converges", async () => {
  const f = await uploadFixture();
  const saved = await uploadImage(
    db,
    f.owner.token,
    { ...f.input, purpose: "PROFILE_PHOTO" },
    bytes
  );
  const photo = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: saved.id }
  });
  await personalPhotoCommand(db, f.owner.token, {
    operation: "delete",
    mutationId: randomUUID(),
    imageId: saved.id,
    expectedVersion: photo.version,
    imageVersion: saved.version,
    confirmed: true
  });
  const retired = await asset(saved.id);
  await due(retired.storagePrefix);
  const job = {
    operation: "cleanup",
    mode: "normal",
    now: new Date(-100).toISOString()
  };
  const interrupted = worker({ ...job, mode: "deleted" });
  await interrupted.phase();
  await assert.rejects(readFile(file(retired.storagePrefix)), {
    code: "ENOENT"
  });
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: retired.storagePrefix }
    })
  );
  await interrupted.kill();
  const replies = await Promise.all([
    worker(job).result(),
    worker(job).result()
  ]);
  assert.ok(replies.every((r) => !r.error));
  assert.equal(
    replies.reduce((n, r) => n + (r.result?.removed ?? 0), 0),
    1
  );
  assert.equal(
    await db.mediaGarbage.count({
      where: { storagePrefix: retired.storagePrefix }
    }),
    0
  );
  await denied(readImage(db, f.owner.token, saved.id, "thumb"), 404);
});

test("missing and truncated retained variants fail safely, recover from restored bytes, and never bypass a later block", async () => {
  const f = await uploadFixture(),
    other = await createPortalActor(db, "mediareader");
  const saved = await uploadImage(db, f.owner.token, f.input, bytes),
    row = await asset(saved.id);
  const path = file(row.storagePrefix, "thumb"),
    original = await readFile(path);
  await rm(path);
  await denied(readImage(db, other.token, saved.id, "thumb"), 503);
  await writeFile(path, original.subarray(0, 3));
  await denied(readImage(db, other.token, saved.id, "thumb"), 503);
  await writeFile(path, original);
  assert.deepEqual(
    await readImage(db, other.token, saved.id, "thumb"),
    original
  );
  const store = imageStorage();
  await denied(
    readImage(db, other.token, saved.id, "thumb", {
      ...store,
      async get(key, signal) {
        const result = await store.get(key, signal);
        await relationshipCommand(db, f.owner.token, {
          operation: "block",
          kind: "person",
          targetId: other.id,
          expectedVersion: 0,
          mutationId: randomUUID(),
          desired: true
        });
        return result;
      }
    }),
    404
  );
  assert.equal((await asset(saved.id)).storagePrefix, row.storagePrefix);
  await canonical(saved.id, f.owner.id, f.input.requestKey);
});

test("retained ready files survive a stale cleanup record during duplicate maintenance", async () => {
  const f = await uploadFixture();
  const saved = await uploadImage(db, f.owner.token, f.input, bytes),
    row = await asset(saved.id);
  await due(row.storagePrefix);
  const results = await Promise.all([
    collectImageGarbage(db, imageStorage(), new Date(-100)),
    collectImageGarbage(db, imageStorage(), new Date(-100))
  ]);
  assert.ok(results.every((r) => r.removed === 0));
  assert.ok((await readImage(db, f.owner.token, saved.id, "original")).length);
  await canonical(saved.id, f.owner.id, f.input.requestKey);
  await db.mediaGarbage.deleteMany({
    where: { storagePrefix: row.storagePrefix }
  });
});

test("lost database commit acknowledgements cannot fill the cleanup page with retained photos and starve later garbage", async () => {
  const owner = await createPortalActor(db, "mediaack");
  // The real transaction commits, then its caller loses the acknowledgement.
  // uploadImage's recovery handler must preserve its uncertain-work ledger.
  const uncertain = new Proxy(db, {
    get(target, name) {
      if (name !== "$transaction") return Reflect.get(target, name);
      return async (...args: Parameters<typeof db.$transaction>) => {
        const result = await Reflect.apply(target.$transaction, target, args);
        if (result && typeof result === "object" && "variants" in result)
          throw Error("Fixture lost database commit acknowledgement");
        return result;
      };
    }
  });
  const saved: string[] = [];
  for (let i = 0; i < 20; i++) {
    const input = command(owner.id, { purpose: "PROFILE_PHOTO" });
    await assert.rejects(
      uploadImage(uncertain, owner.token, input, bytes),
      /lost database commit acknowledgement/
    );
    const row = await db.mediaAsset.findUniqueOrThrow({
      where: {
        uploaderId_requestKey: {
          uploaderId: owner.id,
          requestKey: input.requestKey
        }
      }
    });
    assert.equal(row.status, "READY");
    assert.ok(
      await db.mediaGarbage.findUnique({
        where: { storagePrefix: row.storagePrefix }
      })
    );
    await db.mediaGarbage.update({
      where: { storagePrefix: row.storagePrefix },
      data: { dueAt: new Date(-2000) }
    });
    saved.push(row.id);
  }
  const orphan = "images/" + randomUUID(),
    store = imageStorage();
  await store.put(orphan + "/original.webp", bytes, AbortSignal.timeout(5000));
  await due(orphan);
  assert.deepEqual(await collectImageGarbage(db, store, new Date(-100)), {
    removed: 0
  });
  assert.equal(
    await db.mediaGarbage.count({ where: { dueAt: { lte: new Date(-100) } } }),
    1,
    "Ready assets release stale ledger slots without deleting their files"
  );
  assert.deepEqual(await collectImageGarbage(db, store, new Date(-100)), {
    removed: 1
  });
  await assert.rejects(readFile(file(orphan)), { code: "ENOENT" });
  for (const id of saved)
    assert.ok((await readImage(db, owner.token, id, "thumb")).length);
});
