import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, seedOperatorGrants } from "./seed-portal";
import { seedSupport } from "./seed-support";
import {
  uploadImage,
  readImage,
  listImages,
  collectImageGarbage
} from "../lib/platform/media";
import {
  readFeedbackAttachment,
  removeFeedbackUpload
} from "../lib/platform/feedback-attachments";
import { readSupport, supportCommand } from "../lib/platform/support";
import { FEEDBACK_NOTICE } from "../lib/platform/feedback-types";
import { handleImageDelivery } from "../lib/platform/media-boundary";
import { accountConfig } from "../lib/platform/account-config";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { eraseAdminPersonalData } from "../lib/platform/admin-privacy";
import type { ImageStorage } from "../lib/platform/media-storage";
import { handleFeedbackRequest } from "../lib/platform/feedback-boundary";
import {
  readCommunityReports,
  communityReportCommand
} from "../lib/platform/community-reports";
const db = new PrismaClient();
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.FEEDBACK_INTAKE_ENABLED = "true";
  process.env.SUPPORT_INTAKE_ENABLED = "true";
});
after(() => db.$disconnect());
function memoryStore() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, bytes: Buffer) {
      if (files.has(path)) throw Error("Duplicate immutable object");
      files.set(path, bytes);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      for (const path of paths) files.delete(path);
    }
  } satisfies ImageStorage & { files: Map<string, Buffer> };
}
const bytes = () =>
  sharp({ create: { width: 120, height: 60, channels: 3, background: "blue" } })
    .jpeg()
    .withExifMerge({ IFD0: { Artist: "PRIVATE FEEDBACK FIXTURE" } })
    .toBuffer();
const details = (id: string) => ({
  purpose: "SUPPORT_ATTACHMENT",
  targetId: id,
  requestKey: randomUUID(),
  caption: "A fictional screen",
  alt: "Blue fictional screen"
});
async function input(token: string, attachments: string[]) {
  const s = await readSupport(db, token, "new", { feedbackOnly: true });
  return {
    operation: "feedback-create",
    requestKey: randomUUID(),
    kind: "GENERAL",
    rating: 3,
    description: "A fictional feedback attachment.",
    attachments,
    notice: FEEDBACK_NOTICE,
    consent: true,
    recipientId: s.intake.recipient?.id,
    recipientVersion: s.intake.recipient?.version,
    contactAllowed: false,
    channels: [],
    allowIdea: false,
    publicAttribution: false
  };
}
test("private staging reuses normalized variants and excludes every ordinary image audience", async () => {
  const f = await seedSupport(db),
    store = memoryStore(),
    source = await bytes(),
    original = details(f.memberA.id);
  assert.ok((await sharp(source).metadata()).exif);
  const asset = await uploadImage(db, f.memberA.token, original, source, store);
  assert.equal(
    (await uploadImage(db, f.memberA.token, original, source, store)).id,
    asset.id
  );
  assert.equal(store.files.size, 4);
  assert.equal(
    await db.personalPhoto.count({ where: { assetId: asset.id } }),
    0
  );
  assert.equal(
    await db.mediaGarbage.count({
      where: {
        storagePrefix: (
          await db.mediaAsset.findUniqueOrThrow({ where: { id: asset.id } })
        ).storagePrefix
      }
    }),
    1
  );
  for (const variant of ["original", "large", "medium", "thumb"]) {
    assert.match(
      asset.variants[variant].url,
      /^\/api\/platform\/feedback\/attachments\//
    );
    const normalized = await readFeedbackAttachment(
      db,
      f.memberA.token,
      asset.id,
      variant,
      store
    );
    const metadata = await sharp(normalized).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.xmp, undefined);
    assert.equal(
      normalized.includes(Buffer.from("PRIVATE FEEDBACK FIXTURE")),
      false
    );
    for (const token of [
      "",
      f.memberB.token,
      f.owner.token,
      f.contact.token,
      f.manager.token
    ])
      await assert.rejects(
        readFeedbackAttachment(db, token, asset.id, variant, store)
      );
    await assert.rejects(
      readImage(db, f.memberA.token, asset.id, variant, store)
    );
  }
  await assert.rejects(
    listImages(db, f.memberA.token, "SUPPORT_ATTACHMENT", f.memberA.id)
  );
  await assert.rejects(
    uploadImage(
      db,
      f.memberB.token,
      { ...original, requestKey: randomUUID() },
      source,
      store
    )
  );
  const response = await handleImageDelivery(
    db,
    new Request(accountConfig().origin + asset.variants.thumb.url, {
      headers: { cookie: `church_platform_session=${f.memberA.token}` }
    }),
    asset.id,
    "thumb",
    store,
    readFeedbackAttachment
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /private, no-store/);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.equal(response.headers.get("location"), null);
});
test("case attachment is atomic, bounded and stable across exact retries without moving another receipt", async () => {
  const f = await seedSupport(db),
    store = memoryStore(),
    source = await bytes();
  const images = [];
  for (let i = 0; i < 3; i++)
    images.push(
      await uploadImage(
        db,
        f.memberA.token,
        details(f.memberA.id),
        source,
        store
      )
    );
  await assert.rejects(
    uploadImage(db, f.memberA.token, details(f.memberA.id), source, store),
    /processing|refresh|photos/i
  );
  const payload = await input(
    f.memberA.token,
    images.map((a) => a.id)
  );
  const [saved, retry] = await Promise.all([
    supportCommand(db, f.memberA.token, payload),
    supportCommand(db, f.memberA.token, payload)
  ]);
  assert.equal(saved.caseId, retry.caseId);
  const c = (
    await readSupport(db, f.memberA.token, "detail", {
      caseId: saved.caseId,
      feedbackOnly: true
    })
  ).detail!;
  assert.equal(c.feedback?.attachments.length, 3);
  const rows = await db.mediaAsset.findMany({
    where: { feedbackCaseId: saved.caseId }
  });
  assert.deepEqual(rows.map((r) => r.position).sort(), [0, 1, 2]);
  assert.equal(
    await db.mediaGarbage.count({
      where: { storagePrefix: { in: rows.map((r) => r.storagePrefix) } }
    }),
    0
  );
  const count = await db.supportCase.count({
    where: { requesterId: f.memberA.id }
  });
  await assert.rejects(
    supportCommand(
      db,
      f.memberA.token,
      await input(f.memberA.token, [images[0].id])
    ),
    /attachment/
  );
  await assert.rejects(
    supportCommand(
      db,
      f.memberB.token,
      await input(f.memberB.token, [images[0].id])
    ),
    /attachment/
  );
  assert.equal(
    await db.supportCase.count({ where: { requesterId: f.memberA.id } }),
    count
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: images[0].id } }))
      .feedbackCaseId,
    saved.caseId
  );
});
test("case image delivery rechecks the current assigned grant after provider I/O and excludes routing or coordinator access", async () => {
  const f = await seedSupport(db),
    store = memoryStore();
  const image = await uploadImage(
    db,
    f.memberA.token,
    details(f.memberA.id),
    await bytes(),
    store
  );
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, [image.id])
  );
  assert.ok(
    (await readFeedbackAttachment(db, f.owner.token, image.id, "thumb", store))
      .length
  );
  for (const token of [
    f.memberB.token,
    f.backup.token,
    f.manager.token,
    f.contact.token
  ])
    await assert.rejects(
      readFeedbackAttachment(db, token, image.id, "thumb", store)
    );
  await assert.rejects(
    readFeedbackAttachment(db, f.owner.token, image.id, "thumb", {
      ...store,
      async get(path) {
        await db.supportCapabilityGrant.update({
          where: { id: f.ownerGrant.id },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
        return store.get(path);
      }
    }),
    /unavailable/
  );
  assert.ok(
    (
      await readFeedbackAttachment(
        db,
        f.memberA.token,
        image.id,
        "thumb",
        store
      )
    ).length
  );
  assert.equal(
    (
      await readSupport(db, f.memberA.token, "detail", {
        caseId: saved.caseId,
        feedbackOnly: true
      })
    ).detail?.owner,
    null
  );
});
test("removed case attachments and full erasure stay private after out-of-order recovery without changing case versions", async () => {
  const f = await seedSupport(db),
    store = memoryStore(),
    source = await bytes();
  const a = await uploadImage(
      db,
      f.memberA.token,
      details(f.memberA.id),
      source,
      store
    ),
    b = await uploadImage(
      db,
      f.memberA.token,
      details(f.memberA.id),
      source,
      store
    );
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, [a.id, b.id])
  );
  const payload = {
    operation: "feedback-remove-attachment",
    requestKey: randomUUID(),
    caseId: saved.caseId,
    expectedVersion: 1,
    assetId: a.id,
    assetVersion: 2
  };
  await assert.rejects(supportCommand(db, f.owner.token, payload));
  const removed = await supportCommand(db, f.memberA.token, payload);
  assert.equal(removed.version, 2);
  assert.equal((await supportCommand(db, f.memberA.token, payload)).version, 2);
  const entry = (
    await db.retentionControl.findFirstOrThrow({
      where: { kind: "SUPPORT_ATTACHMENT", sourceId: saved.caseId }
    })
  ).payload as unknown as RetentionControlEntry;
  assert.equal(entry.targetId, a.id);
  assert.equal(JSON.stringify(entry).includes("Blue fictional"), false);
  await db.mediaAsset.update({
    where: { id: a.id },
    data: {
      status: "READY",
      caption: "Restored private caption",
      alt: "Restored private description"
    }
  });
  await replayRetentionControls(db, [entry]);
  await replayRetentionControls(db, [entry]);
  await assert.rejects(
    readFeedbackAttachment(db, f.memberA.token, a.id, "thumb", store)
  );
  const retired = await db.mediaAsset.findUniqueOrThrow({
    where: { id: a.id }
  });
  assert.equal(retired.caption, "");
  assert.equal(retired.alt, "");
  assert.equal(
    (await db.supportCase.findUniqueOrThrow({ where: { id: saved.caseId } }))
      .version,
    2
  );
  assert.ok(
    (await readFeedbackAttachment(db, f.memberA.token, b.id, "thumb", store))
      .length
  );
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    await eraseAdminPersonalData(tx, f.memberA.id, new Date());
  });
  await assert.rejects(
    readFeedbackAttachment(db, f.owner.token, b.id, "thumb", store)
  );
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: b.id } })).status,
    "RETIRED"
  );
});
test("failed and abandoned uploads retain cleanup ownership, expire before attachment and support protected explicit discard", async () => {
  const f = await seedSupport(db),
    store = memoryStore(),
    source = await bytes(),
    original = details(f.memberA.id);
  let writes = 0;
  await assert.rejects(
    uploadImage(db, f.memberA.token, original, source, {
      ...store,
      async put(path, bytes) {
        await store.put(path, bytes);
        if (++writes === 1)
          throw Error("Fictional lost provider acknowledgement");
      }
    })
  );
  const failed = await db.mediaAsset.findUniqueOrThrow({
    where: {
      uploaderId_requestKey: {
        uploaderId: f.memberA.id,
        requestKey: original.requestKey
      }
    }
  });
  assert.equal(failed.status, "UPLOADING");
  assert.ok(
    await db.mediaGarbage.findUnique({
      where: { storagePrefix: failed.storagePrefix }
    })
  );
  const ready = await uploadImage(db, f.memberA.token, original, source, store);
  const asset = await db.mediaAsset.findUniqueOrThrow({
    where: { id: ready.id }
  });
  assert.notEqual(asset.storagePrefix, failed.storagePrefix);
  await removeFeedbackUpload(db, f.memberA.token, {
    operation: "feedback-remove-upload",
    assetId: ready.id,
    assetVersion: ready.version
  });
  await removeFeedbackUpload(db, f.memberA.token, {
    operation: "feedback-remove-upload",
    assetId: ready.id,
    assetVersion: ready.version
  });
  assert.ok(
    (
      await db.retentionControl.findFirstOrThrow({
        where: { kind: "SUPPORT_ATTACHMENT", sourceId: ready.id }
      })
    ).journaledAt
  );
  const expired = await uploadImage(
    db,
    f.memberA.token,
    details(f.memberA.id),
    source,
    store
  );
  const row = await db.mediaAsset.update({
    where: { id: expired.id },
    data: { createdAt: new Date(Date.now() - 25 * 3600_000) }
  });
  await db.mediaGarbage.update({
    where: { storagePrefix: row.storagePrefix },
    data: { dueAt: new Date(0) }
  });
  await assert.rejects(
    readFeedbackAttachment(db, f.memberA.token, expired.id, "thumb", store)
  );
  await assert.rejects(
    supportCommand(
      db,
      f.memberA.token,
      await input(f.memberA.token, [expired.id])
    ),
    /expired/
  );
  await collectImageGarbage(db, store, new Date(), undefined, {
    maximum: 100,
    intervalMs: 0
  });
  assert.equal(
    (await db.mediaAsset.findUniqueOrThrow({ where: { id: expired.id } }))
      .status,
    "RETIRED"
  );
  assert.equal(
    [...store.files.keys()].some((path) => path.startsWith(row.storagePrefix)),
    false
  );
});

test("the viewer list requires its current account and case access, including staff without exposing other private cases", async () => {
  const f = await seedSupport(db),
    store = memoryStore();
  const image = await uploadImage(
    db,
    f.memberA.token,
    details(f.memberA.id),
    await bytes(),
    store
  );
  const saved = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, [image.id])
  );
  const request = (
    actor: { id: string; token: string },
    owner: string | null = actor.id
  ) =>
    new Request(
      accountConfig().origin +
        `/api/platform/feedback?view=attachments&caseId=${saved.caseId}`,
      {
        headers: {
          cookie: `church_platform_session=${actor.token}`,
          ...(owner ? { "x-expected-account": owner } : {})
        }
      }
    );
  for (const actor of [f.memberA, f.owner]) {
    const response = await handleFeedbackRequest(db, request(actor));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(Object.keys(body), ["images"]);
    assert.equal(body.images[0].id, image.id);
    assert.equal(JSON.stringify(body).includes("feedback attachment."), false);
    assert.match(response.headers.get("cache-control")!, /private, no-store/);
  }
  for (const actor of [f.memberB, f.manager, f.contact, f.backup])
    assert.equal((await handleFeedbackRequest(db, request(actor))).status, 404);
  assert.equal(
    (await handleFeedbackRequest(db, request(f.owner, null))).status,
    400
  );
  assert.equal(
    (await handleFeedbackRequest(db, request(f.owner, f.memberA.id))).status,
    401
  );
});

test("a harmful attachment uses the existing report receipt without granting private case or image access to a report reviewer", async () => {
  const f = await seedSupport(db),
    store = memoryStore();
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
  process.env.COMMUNITY_REPORTS_PER_10_MINUTES = "5";
  await seedOperatorGrants(db, f.owner, ["REVIEW_COMMUNITY_REPORTS"]);
  await seedOperatorGrants(db, f.manager, ["REVIEW_COMMUNITY_REPORTS"]);
  const image = await uploadImage(
    db,
    f.memberA.token,
    details(f.memberA.id),
    await bytes(),
    store
  );
  const c = await supportCommand(
    db,
    f.memberA.token,
    await input(f.memberA.token, [image.id])
  );
  const target = {
    view: "target",
    targetType: "FEEDBACK_ATTACHMENT",
    targetId: image.id
  };
  const selected = await readCommunityReports(db, f.memberA.token, target);
  assert.ok(selected.target);
  assert.equal(selected.available, true);
  assert.equal(JSON.stringify(selected).includes("A fictional screen"), false);
  for (const actor of [f.memberB, f.manager, f.contact])
    await assert.rejects(readCommunityReports(db, actor.token, target));
  const body = {
    operation: "create",
    mutationId: randomUUID(),
    targetType: target.targetType,
    targetId: image.id,
    expectedTargetVersion: selected.target.version,
    expectedContextVersion: selected.target.contextVersion,
    reason: "PRIVACY",
    details: "A deliberately submitted fictional image concern."
  };
  const [report, retry] = await Promise.all([
    communityReportCommand(db, f.memberA.token, body),
    communityReportCommand(db, f.memberA.token, body)
  ]);
  assert.equal(report.id, retry.id);
  const authorized = await readCommunityReports(db, f.owner.token, {
    view: "review",
    id: report.id
  });
  assert.equal(authorized.evidence?.attachment?.id, image.id);
  const scoped = await readCommunityReports(db, f.manager.token, {
    view: "review",
    id: report.id
  });
  assert.equal(scoped.evidence, undefined);
  assert.equal(scoped.report?.details, body.details);
  assert.equal(JSON.stringify(scoped).includes("Blue fictional screen"), false);
  await assert.rejects(
    readFeedbackAttachment(db, f.manager.token, image.id, "original", store)
  );
  await supportCommand(db, f.memberA.token, {
    operation: "feedback-remove-attachment",
    requestKey: randomUUID(),
    caseId: c.caseId,
    expectedVersion: 1,
    assetId: image.id,
    assetVersion: 2
  });
  assert.equal(
    (
      await readCommunityReports(db, f.owner.token, {
        view: "review",
        id: report.id
      })
    ).evidence,
    undefined
  );
  await assert.rejects(readCommunityReports(db, f.memberA.token, target));
  assert.equal(
    await db.communityReport.count({
      where: {
        reporterId: f.memberA.id,
        targetType: "FEEDBACK_ATTACHMENT",
        targetId: image.id
      }
    }),
    1
  );
});
