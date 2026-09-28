import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { mediaReadableSql } from "../lib/platform/media-catalog-policy";
import { postContext } from "../lib/platform/post-access";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { mediaCatalogCommand as command } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead as read } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { PortalError } from "../lib/platform/portal-policy";
import {
  exportMedia,
  eraseMedia,
  replayMediaControl
} from "../lib/platform/media-catalog-retention";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
const db = new PrismaClient();
let owner: PortalActor,
  other: PortalActor,
  editor: PortalActor,
  churchId: string;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "mediaown");
  other = await createPortalActor(db, "mediaother");
  editor = await createPortalActor(db, "mediaedit");
  churchId = (
    await db.church.create({
      data: {
        slug: randomUUID(),
        name: "Fictional media church",
        summary: "Isolated fixture",
        communityListed: true
      }
    })
  ).id;
  await db.churchConnection.createMany({
    data: [owner, editor].map((a) => ({
      userId: a.id,
      churchId,
      state: "APPROVED"
    }))
  });
  const claim = await db.churchClaim.create({
    data: {
      ownerId: owner.id,
      requestKey: randomUUID(),
      churchId,
      kind: "INITIAL",
      authority: {},
      profile: {},
      status: "APPROVED",
      approvedAt: new Date(),
      activatedAt: new Date()
    }
  });
  await db.churchCapabilityGrant.createMany({
    data: [
      {
        userId: owner.id,
        churchId,
        capability: "MANAGE_CHURCH_ACCESS",
        sourceClaimId: claim.id
      },
      { userId: owner.id, churchId, capability: "MANAGE_CHURCH_MEDIA" },
      { userId: editor.id, churchId, capability: "EDIT_CHURCH_MEDIA" }
    ]
  });
});
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const input = (operation: string, more: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...more
});
const fields = (patch: Record<string, unknown> = {}) =>
  mediaFields({
    title: "Fictional recording",
    description: "A catalog test",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk",
    ...patch
  });
const reviewed = (f: ReturnType<typeof fields>) => ({
  fields: f,
  acknowledgment: {
    policy: MEDIA_POLICY,
    sourceUrl: f.sourceUrl,
    audience: f.audience,
    accepted: true
  },
  rights: {
    basis: "OWN",
    reviewed: true,
    publicRecording: true,
    textRights: true
  }
});
const create = (f = fields(), actor = owner, church: string | null = null) =>
  command(
    db,
    actor.token,
    input("create", { ownerChurchId: church, ...reviewed(f) })
  );
async function published(
  f = fields(),
  actor = owner,
  church: string | null = null
) {
  const r = await create(f, actor, church);
  const v = input("publish", {
    itemId: r.id,
    expectedVersion: r.version,
    ...reviewed(f)
  });
  return { r: await command(db, actor.token, v), v };
}
const detail = (id: string, actor?: PortalActor) =>
  read(db, actor?.token, new URLSearchParams({ view: "detail", id }));
const denied = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) => e instanceof PortalError && e.status === status
  );

test("drafts stay private; all five formats publish one stable canonical identity", async () => {
  for (const [format, details] of [
    ["SERMON", { preachedOn: null }],
    ["PODCAST", { episodeKind: "FULL", season: 1, episode: 2 }],
    ["TESTIMONY", { subject: "SELF" }],
    ["SERVICE", {}],
    ["TEACHING", { lessonNumber: 1 }]
  ] as const) {
    const f = fields({ format, details }),
      draft = await create(f);
    await denied(detail(draft.id));
    const r = await command(
      db,
      owner.token,
      input("publish", { itemId: draft.id, expectedVersion: 1, ...reviewed(f) })
    );
    assert.equal(r.id, draft.id);
    const result = await detail(r.id);
    assert.equal(result.item?.title, f.title);
    assert.equal(JSON.stringify(result).includes("evidenceReference"), false);
  }
});
test("null audience and mismatched acknowledgment cannot leak incomplete drafts", async () => {
  const f = fields({ audience: null }),
    r = await create(f);
  await denied(
    command(
      db,
      owner.token,
      input("publish", { itemId: r.id, expectedVersion: 1, ...reviewed(f) })
    ),
    400
  );
  await denied(detail(r.id));
  await denied(
    command(
      db,
      owner.token,
      input("save", {
        itemId: r.id,
        expectedVersion: 1,
        ...reviewed(fields()),
        acknowledgment: {
          policy: MEDIA_POLICY,
          sourceUrl: f.sourceUrl,
          audience: null,
          accepted: true
        }
      })
    ),
    400
  );
});
test("MEMBERS and CHURCH audiences filter before detail, count and search", async () => {
  const unique = randomUUID(),
    { r: m } = await published(fields({ title: unique, audience: "MEMBERS" }));
  await denied(detail(m.id));
  assert.ok((await detail(m.id, other)).item);
  const { r: c } = await published(
    fields({ title: unique, audience: "CHURCH" }),
    owner,
    churchId
  );
  await denied(detail(c.id, other));
  assert.ok((await detail(c.id, editor)).item);
  const q = new URLSearchParams({ q: unique });
  assert.equal((await read(db, null, q)).total, 0);
  assert.equal((await read(db, other.token, q)).total, 1);
  assert.equal((await read(db, editor.token, q)).total, 2);
});
test("editor may choose intended draft audience but cannot publish, edit another draft or live item", async () => {
  const f = fields(),
    r = await create(f, editor, churchId),
    otherDraft = await create(f, owner, churchId);
  await denied(
    command(
      db,
      editor.token,
      input("publish", { itemId: r.id, expectedVersion: 1, ...reviewed(f) })
    )
  );
  await denied(
    command(
      db,
      editor.token,
      input("save", {
        itemId: otherDraft.id,
        expectedVersion: 1,
        ...reviewed(f)
      })
    )
  );
  await command(
    db,
    editor.token,
    input("save", {
      itemId: r.id,
      expectedVersion: 1,
      ...reviewed(fields({ audience: "MEMBERS" }))
    })
  );
  await command(
    db,
    owner.token,
    input("publish", { itemId: r.id, expectedVersion: 2, ...reviewed(f) })
  );
  await denied(
    command(
      db,
      editor.token,
      input("save", { itemId: r.id, expectedVersion: 3, ...reviewed(f) })
    )
  );
});
test("approved membership, managed activation, duty and MFA are independent current gates", async () => {
  const r = await create(fields(), editor, churchId);
  await db.churchConnection.update({
    where: { userId_churchId: { userId: editor.id, churchId } },
    data: { state: "WITHDRAWN" }
  });
  await denied(
    read(
      db,
      editor.token,
      new URLSearchParams({ view: "editor", id: r.id }),
      editor.id
    )
  );
  await db.churchConnection.update({
    where: { userId_churchId: { userId: editor.id, churchId } },
    data: { state: "APPROVED" }
  });
  const grant = await db.churchCapabilityGrant.findFirstOrThrow({
    where: { userId: owner.id, sourceClaimId: { not: null } }
  });
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await denied(
    command(
      db,
      editor.token,
      input("save", { itemId: r.id, expectedVersion: 1, ...reviewed(fields()) })
    )
  );
  await db.churchCapabilityGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
  const prior = process.env.PRIVILEGED_MFA_MODE;
  process.env.PRIVILEGED_MFA_MODE = "enforce";
  try {
    await denied(
      read(
        db,
        editor.token,
        new URLSearchParams({ view: "editor", id: r.id }),
        editor.id
      )
    );
    await create(fields(), owner);
  } finally {
    process.env.PRIVILEGED_MFA_MODE = prior;
  }
});
test("rights expiry, revocation, takedown and block immediately suppress metadata and source", async () => {
  const { r } = await published();
  await db.mediaCatalogRights.update({
    where: { itemId: r.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await denied(detail(r.id));
  assert.equal(
    (await db.$transaction((tx) => exportMedia(tx, owner.id, 2000))).some(
      (x) => x.id === r.id
    ),
    false
  );
  await db.mediaCatalogRights.update({
    where: { itemId: r.id },
    data: { expiresAt: null }
  });
  await db.mediaCatalogItem.update({
    where: { id: r.id },
    data: { moderationState: "HIDDEN" }
  });
  await denied(detail(r.id));
  assert.equal(
    (await db.$transaction((tx) => exportMedia(tx, owner.id, 2000))).some(
      (x) => x.id === r.id
    ),
    false
  );
  await denied(
    command(
      db,
      owner.token,
      input("publish", {
        itemId: r.id,
        expectedVersion: r.version,
        ...reviewed(fields())
      })
    )
  );
  await db.mediaCatalogItem.update({
    where: { id: r.id },
    data: { moderationState: "VISIBLE" }
  });
  const block = await db.socialRelationship.create({
    data: { ownerId: other.id, targetUserId: owner.id, blocked: true }
  });
  await denied(detail(r.id, other));
  await db.socialRelationship.delete({ where: { id: block.id } });
});
test("version conflicts preserve live version and exact retries do not renew rights", async () => {
  const { r, v } = await published();
  const before = await db.mediaCatalogRights.findUniqueOrThrow({
    where: { itemId: r.id }
  });
  assert.deepEqual(await command(db, owner.token, v), r);
  assert.deepEqual(
    (await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } }))
      .assertedAt,
    before.assertedAt
  );
  await denied(
    command(
      db,
      owner.token,
      input("save", {
        itemId: r.id,
        expectedVersion: 1,
        ...reviewed(fields({ title: "changed" }))
      })
    ),
    409
  );
  assert.equal((await detail(r.id)).item?.title, "Fictional recording");
  await command(
    db,
    owner.token,
    input("unpublish", { itemId: r.id, expectedVersion: r.version })
  );
  await denied(command(db, owner.token, v));
  await denied(detail(r.id));
});
test("remove response-loss retries recover only under current owner authority", async () => {
  const { r } = await published(),
    v = input("remove", { itemId: r.id, expectedVersion: r.version }),
    receipt = await command(db, owner.token, v);
  assert.deepEqual(await command(db, owner.token, v), receipt);
  await denied(detail(r.id));
  await denied(command(db, other.token, v));
  assert.equal(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } }))
      .sourceUrl,
    null
  );
});
test("protected recovery quarantines older content and creates no-source tombstones", async () => {
  const { r } = await published();
  const entry = (
    await db.retentionControl.findFirstOrThrow({
      where: { kind: "MEDIA_CATALOG", sourceId: r.id },
      orderBy: { version: "desc" }
    })
  ).payload as unknown as RetentionControlEntry;
  await db.mediaCatalogItem.update({
    where: { id: r.id },
    data: { controlVersion: 1 }
  });
  await replayRetentionControls(db, [entry]);
  await denied(detail(r.id));
  const restored = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: r.id }
  });
  assert.equal(restored.recoveryRequired, true);
  assert.equal(restored.sourceUrl, null);
  assert.equal(restored.title, "");
  const missing = randomUUID();
  await db.$transaction((tx) => replayMediaControl(tx, missing, 7, new Date()));
  assert.equal(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: missing } }))
      .ownerId,
    null
  );
});
test("personal erasure clears personal catalog; church work survives creator departure without a new grant", async () => {
  const person = await createPortalActor(db, "mediaerase"),
    p = await create(fields(), person),
    church = await create(fields(), editor, churchId);
  await db.$transaction((tx) => eraseMedia(tx, person.id, new Date()));
  assert.equal(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: p.id } }))
      .title,
    ""
  );
  await db.$transaction((tx) => eraseMedia(tx, editor.id, new Date()));
  const row = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: church.id }
  });
  assert.equal(row.createdById, null);
  assert.equal(row.title, "Fictional recording");
  assert.ok(
    (
      await read(
        db,
        owner.token,
        new URLSearchParams({ view: "editor", id: church.id }),
        owner.id
      )
    ).item
  );
});

test("changed-body receipt conflicts and expired draft retries preserve their original assertion", async () => {
  const f = fields(),
    v = input("create", { ownerChurchId: null, ...reviewed(f) }),
    r = await command(db, owner.token, v);
  await denied(
    command(db, owner.token, {
      ...v,
      fields: { ...f, title: "Different body" }
    }),
    409
  );
  const assertion = await db.mediaCatalogRights.findUniqueOrThrow({
    where: { itemId: r.id }
  });
  await db.mediaCatalogRights.update({
    where: { itemId: r.id },
    data: { expiresAt: new Date(Date.now() - 1000) }
  });
  await denied(command(db, owner.token, v));
  assert.deepEqual(
    (await db.mediaCatalogRights.findUniqueOrThrow({ where: { itemId: r.id } }))
      .assertedAt,
    assertion.assertedAt
  );
});
test("source and format changes require explicit replacement and current review without disturbing prior publication", async () => {
  const { r } = await published();
  const f = fields({ format: "TEACHING", details: { lessonNumber: 2 } });
  const without = { ...f } as Record<string, unknown>;
  delete without.details;
  await denied(
    command(
      db,
      owner.token,
      input("save", {
        itemId: r.id,
        expectedVersion: r.version,
        ...reviewed(f),
        fields: without
      })
    ),
    400
  );
  await denied(
    command(
      db,
      owner.token,
      input("save", {
        itemId: r.id,
        expectedVersion: r.version,
        ...reviewed(f),
        rights: undefined
      })
    ),
    400
  );
  const changed = await command(
    db,
    owner.token,
    input("save", { itemId: r.id, expectedVersion: r.version, ...reviewed(f) })
  );
  assert.equal(changed.id, r.id);
  assert.equal((await detail(r.id)).item?.format, "TEACHING");
});
test("source withdrawal cannot leak through lists, export, late retry or recovery journals", async () => {
  const { r, v } = await published(
    fields({ title: "Withdrawal " + randomUUID() })
  );
  await command(
    db,
    owner.token,
    input("source-unavailable", { itemId: r.id, expectedVersion: r.version })
  );
  await denied(detail(r.id));
  await denied(command(db, owner.token, v));
  assert.equal(
    (await db.$transaction((tx) => exportMedia(tx, owner.id, 2000))).some(
      (x) => x.id === r.id
    ),
    false
  );
  const controls = await db.retentionControl.findMany({
    where: { kind: "MEDIA_CATALOG", sourceId: r.id }
  });
  const audit = await db.mediaCatalogEvent.findMany({
    where: { itemId: r.id }
  });
  assert.ok(!JSON.stringify([controls, audit]).includes("youtube"));
  assert.ok(!JSON.stringify([controls, audit]).includes("Withdrawal"));
});
test("personal restrictions and revoked church duties deny historical receipts without deleting church work", async () => {
  const { r } = await published(),
    v = input("create", { ownerChurchId: churchId, ...reviewed(fields()) }),
    c = await command(db, owner.token, v);
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: new Date() }
  });
  await denied(detail(r.id));
  await assert.rejects(command(db, owner.token, v));
  await db.platformUser.update({
    where: { id: owner.id },
    data: { suspendedAt: null }
  });
  await db.churchCapabilityGrant.updateMany({
    where: { userId: owner.id, churchId, capability: "MANAGE_CHURCH_MEDIA" },
    data: { revokedAt: new Date() }
  });
  await denied(command(db, owner.token, v));
  assert.equal(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: c.id } }))
      .title,
    "Fictional recording"
  );
  await db.churchCapabilityGrant.updateMany({
    where: { userId: owner.id, churchId, capability: "MANAGE_CHURCH_MEDIA" },
    data: { revokedAt: null }
  });
});
test("metadata filters and pagination count only current readable items", async () => {
  const token = randomUUID();
  for (let i = 0; i < 22; i++)
    await published(
      fields({
        title: token + " " + i,
        speakers: ["Fictional Speaker"],
        series: "Series " + token,
        topics: ["Mercy"],
        audience: i === 21 ? "MEMBERS" : "PUBLIC"
      })
    );
  const q = new URLSearchParams({
    q: token,
    speaker: "fictional",
    series: token,
    topic: "mercy",
    format: "SERMON"
  });
  const first = await read(db, null, q);
  assert.equal(first.total, 21);
  assert.equal(first.items?.length, 20);
  q.set("page", "1");
  assert.equal((await read(db, null, q)).items?.length, 1);
  q.set("topic", "unmatched");
  assert.equal((await read(db, null, q)).total, 0);
});

test("publication and rights expiry use UTC timestamps across database session time zones", async () => {
  const now = new Date();
  const visible = (await published()).r;
  const future = (await published()).r;
  const expired = (await published()).r;
  const boundary = (await published()).r;
  const ids = [visible.id, future.id, expired.id, boundary.id];
  for (const row of [visible, future, expired, boundary]) {
    await db.mediaCatalogItem.update({
      where: { id: row.id },
      data: {
        publishedAt: new Date(
          now.getTime() + (row.id === future.id ? 3600000 : -60000)
        )
      }
    });
    await db.mediaCatalogRights.update({
      where: { itemId: row.id },
      data: {
        expiresAt: new Date(
          now.getTime() +
            (row.id === expired.id
              ? -60000
              : row.id === boundary.id
                ? 0
                : 3600000)
        )
      }
    });
  }
  for (const zone of ["UTC", "America/Chicago", "Asia/Tokyo"]) {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('TimeZone', ${zone}, true)`;
      const context = await postContext(tx, null);
      const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT m.id FROM "MediaCatalogItem" m
        WHERE m.id IN (${Prisma.join(ids)}) AND (${mediaReadableSql(context, now)})`);
      assert.deepEqual(
        rows.map((row) => row.id),
        [visible.id],
        zone + ": published, unexpired item only"
      );
      const exported = (await exportMedia(tx, owner.id, 1000)).filter((row) =>
        ids.includes(row.id)
      );
      assert.deepEqual(
        exported.map((row) => row.id).sort(),
        [visible.id, future.id].sort(),
        zone + ": expired rights remain absent from personal export"
      );
    });
  }
});
