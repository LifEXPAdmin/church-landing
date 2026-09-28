import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  createPortalActor,
  assertPortalTestDatabase,
  type PortalActor
} from "./seed-portal";
import { mediaCatalogCommand as command } from "../lib/platform/media-catalog-commands";
import { mediaCatalogRead as read } from "../lib/platform/media-catalog-reads";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import { SCRIPTURE_REGISTRY_VERSION as version } from "../lib/platform/scripture-registry";
import {
  exportMedia,
  eraseMedia,
  replayMediaControl
} from "../lib/platform/media-catalog-retention";
import { PortalError } from "../lib/platform/portal-policy";
const queries: string[] = [];
const db = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
db.$on("query", (event) => queries.push(event.query));
let owner: PortalActor, other: PortalActor;
const run = `scripture_${randomUUID()}`;
before(async () => {
  await assertPortalTestDatabase(db);
  owner = await createPortalActor(db, "scripture");
  other = await createPortalActor(db, "scr_other");
});
after(() => db.$disconnect());
const refs = (text: string, system = "sil-eng") => [
  { referenceSystemId: system, referenceVersion: version, originals: [text] }
];
const fields = (patch: Record<string, unknown> = {}) =>
  mediaFields({
    title: run,
    description: "Fictional isolated Scripture catalog",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    sourceUrl: "https://youtu.be/abcdefghijk",
    details: { preachedOn: null },
    scriptureRanges: refs("John 3:16-18"),
    ...patch
  });
const review = (f: ReturnType<typeof fields>) => ({
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
const input = (operation: string, rest: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...rest
});
async function published(f = fields(), actor = owner) {
  const created = await command(
    db,
    actor.token,
    input("create", { ownerChurchId: null, ...review(f) })
  );
  const request = input("publish", {
    itemId: created.id,
    expectedVersion: created.version,
    ...review(f)
  });
  return { result: await command(db, actor.token, request), request };
}
const search = (
  text: string,
  system = "sil-eng",
  token?: string,
  more: Record<string, string> = {}
) =>
  read(
    db,
    token,
    new URLSearchParams({
      q: run,
      scripture: text,
      referenceSystem: system,
      ...more
    })
  );
const reject = (promise: Promise<unknown>, status = 400) =>
  assert.rejects(
    promise,
    (e: unknown) => e instanceof PortalError && e.status === status
  );

test("persisted references survive reload; overlap SQL separates books and systems and combines filters", async () => {
  const f = fields({
    topics: ["hope"],
    speakers: ["Fictional Speaker"],
    series: "Fictional Series",
    scriptureRanges: refs("Jn 3:16-18;John 3:16-18")
  });
  const { result: r, request } = await published(f);
  assert.deepEqual(await command(db, owner.token, request), r);
  const detail = await read(
    db,
    undefined,
    new URLSearchParams({ view: "detail", id: r.id })
  );
  assert.deepEqual(detail.item?.scriptureRanges, f.scriptureRanges);
  assert.equal(
    (
      await search("John 3:18-20", "sil-eng", undefined, {
        topic: "hope",
        format: "SERMON",
        speaker: "Fictional Speaker",
        series: "Fictional Series"
      })
    ).items?.some((i) => i.id === r.id),
    true
  );
  for (const [q, system] of [
    ["John 3:19", "sil-eng"],
    ["1 John 3:16", "sil-eng"],
    ["John 3:16", "sil-org"]
  ])
    assert.equal(
      (await search(q, system)).items?.some((i) => i.id === r.id),
      false
    );
  assert.equal(
    (await search("John 3")).items?.some((i) => i.id === r.id),
    true
  );
  assert.equal(
    (await search("John")).items?.some((i) => i.id === r.id),
    true
  );
  assert.equal(
    (await search("Mark 1;John 3:18")).items?.some((i) => i.id === r.id),
    true
  );
});
test("current audience, block and unpublication suppress tagged records before totals and results", async () => {
  const { result: m } = await published(fields({ audience: "MEMBERS" }));
  assert.equal(
    (await search("John 3:16")).items?.some((i) => i.id === m.id),
    false
  );
  assert.equal(
    (await search("John 3:16", "sil-eng", other.token)).items?.some(
      (i) => i.id === m.id
    ),
    true
  );
  const block = await db.socialRelationship.create({
    data: { ownerId: other.id, targetUserId: owner.id, blocked: true }
  });
  const hidden = await search("John 3:16", "sil-eng", other.token);
  assert.equal(hidden.items?.length, 0);
  assert.equal(hidden.total, 0);
  await db.socialRelationship.delete({ where: { id: block.id } });
  await command(
    db,
    owner.token,
    input("unpublish", { itemId: m.id, expectedVersion: m.version })
  );
  assert.equal(
    (await search("John 3:16", "sil-eng", other.token)).items?.some(
      (i) => i.id === m.id
    ),
    false
  );
});
test("invalid edits and forged keys preserve all previously saved metadata and version", async () => {
  const { result: r } = await published();
  const before = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: r.id }
  });
  for (const bad of [
    refs("John 3:99"),
    [{ ...fields().scriptureRanges[0], endKey: 999999 }],
    refs("John 3:16", "unknown")
  ]) {
    await reject(
      command(
        db,
        owner.token,
        input("save", {
          itemId: r.id,
          expectedVersion: r.version,
          ...review(fields()),
          fields: { ...fields(), title: "must not save", scriptureRanges: bad }
        })
      )
    );
    assert.deepEqual(
      await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } }),
      before
    );
  }
  await reject(search("John 3:99"));
  await reject(search("John 3:16", ""));
});
test("old clients cannot silently erase tags; explicit clearing still uses current review and version", async () => {
  const { result: r } = await published();
  const f = fields();
  const oldFields: Record<string, unknown> = { ...f };
  delete oldFields.scriptureRanges;
  await reject(
    command(
      db,
      owner.token,
      input("save", {
        itemId: r.id,
        expectedVersion: r.version,
        ...review(f),
        fields: oldFields
      })
    ),
    409
  );
  const cleared = fields({ scriptureRanges: [] });
  await command(
    db,
    owner.token,
    input("save", {
      itemId: r.id,
      expectedVersion: r.version,
      ...review(cleared)
    })
  );
  assert.deepEqual(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: r.id } }))
      .scriptureRanges,
    []
  );
  assert.equal(
    (await search("John 3:16")).items?.some((i) => i.id === r.id),
    false
  );
});
test("personal export contains supplied references; removal, erasure and stale replay clear every reference", async () => {
  const actor = await createPortalActor(db, "scr_erase");
  const { result: removed } = await published(fields(), actor);
  await command(
    db,
    actor.token,
    input("remove", { itemId: removed.id, expectedVersion: removed.version })
  );
  assert.deepEqual(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: removed.id } }))
      .scriptureRanges,
    []
  );
  const { result: erased } = await published(
    fields({ scriptureRanges: refs("John 3:36-4:2") }),
    actor
  );
  const exported = await db.$transaction((tx) =>
    exportMedia(tx, actor.id, 100)
  );
  assert.equal(
    exported.find((i) => i.id === erased.id)?.scriptureRanges instanceof Array,
    true
  );
  assert.match(JSON.stringify(exported), /John 3:36-4:2/);
  await db.$transaction((tx) => eraseMedia(tx, actor.id, new Date()));
  assert.deepEqual(
    (await db.mediaCatalogItem.findUniqueOrThrow({ where: { id: erased.id } }))
      .scriptureRanges,
    []
  );
  const { result: stale } = await published();
  await db.$transaction((tx) =>
    replayMediaControl(tx, stale.id, 100, new Date())
  );
  const row = await db.mediaCatalogItem.findUniqueOrThrow({
    where: { id: stale.id }
  });
  assert.deepEqual(row.scriptureRanges, []);
  assert.equal(row.recoveryRequired, true);
  assert.equal(
    (await search("John 3:16")).items?.some((i) => i.id === stale.id),
    false
  );
});
test("dense pagination and overlap query counts remain independent of record count", async () => {
  const label = run + "_pages";
  for (let i = 0; i < 23; i++)
    await published(
      fields({
        title: label,
        scriptureRanges: refs(i === 22 ? "Mark 1" : "John 8:1-11")
      })
    );
  queries.length = 0;
  const first = await search("John 8:11", "sil-eng", undefined, { q: label });
  assert.equal(first.total, 22);
  assert.equal(first.items?.length, 20);
  const count = queries.filter((q) =>
    q.includes("jsonb_array_elements")
  ).length;
  assert.equal(
    count,
    2,
    "one selection and one count query, never a query per item"
  );
  const second = await search("John 8:11", "sil-eng", undefined, {
    q: label,
    page: "1"
  });
  assert.equal(second.items?.length, 2);
  assert.equal(second.total, 22);
  assert.equal(
    new Set([...first.items!, ...second.items!].map((i) => i.id)).size,
    22
  );
});
