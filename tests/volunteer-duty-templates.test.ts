import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";
import { volunteerDutyTemplateCommand as command } from "../lib/platform/volunteer-duty-template-commands";
import {
  volunteerDutyTemplateWorkspace as workspace,
  volunteerDutyTemplateList as list,
  volunteerDutyTemplateDetail as detail,
  volunteerDutyTemplateApply as apply
} from "../lib/platform/volunteer-duty-template-reads";
import {
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import { PortalError } from "../lib/platform/portal-policy";
import { postCommand } from "../lib/platform/post-commands";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedVolunteerApplications>>;
before(async () => {
  await assertPortalTestDatabase(db);
  f = await seedVolunteerApplications(db, true, 3);
});
after(() => db.$disconnect());
const denied = (
  promise: Promise<unknown> | (() => Promise<unknown>),
  status: number
) =>
  assert.rejects(
    async () => (typeof promise === "function" ? promise() : promise),
    (error) => error instanceof PortalError && error.status === status
  );
const fields = {
  title: "Fictional welcome duty",
  duties: "Welcome visitors and explain the meeting point.",
  requirements: "Read the published instructions.",
  commitment: "One hour by arrangement."
};
const input = (patch: Record<string, unknown> = {}) => ({
  operation: "save",
  id: randomUUID(),
  churchId: f.churchA.id,
  expectedVersion: 0,
  mutationId: randomUUID(),
  ...fields,
  ...patch
});
const row = (id: string) =>
  db.volunteerDutyTemplate.findUniqueOrThrow({ where: { id } });
const applyInput = (id: string, version = 1) => ({
  id,
  postId: f.post.id,
  expectedVersion: version,
  postVersion: f.post.version
});
const originalState = async () => ({
  post: await db.platformPost.findUniqueOrThrow({ where: { id: f.post.id } }),
  occurrence: await db.calendarOccurrence.findUniqueOrThrow({
    where: { id: f.occurrence.id }
  }),
  opportunity: await db.volunteerOpportunity.findUniqueOrThrow({
    where: { id: f.opportunity.id }
  }),
  slot: await db.postVolunteerSlot.findUniqueOrThrow({
    where: { id: f.opportunity.slotId! }
  }),
  applications: await db.volunteerApplication.findMany({
    where: { opportunityId: f.opportunity.id },
    orderBy: { id: "asc" }
  }),
  signups: await db.postVolunteerSignup.findMany({
    where: { slotId: f.opportunity.slotId! },
    orderBy: { id: "asc" }
  })
});

test("current coordinators get a private workspace and create/edit exact receipts without duplicate writes", async () => {
  const own = await workspace(db, f.ada.token);
  assert.equal(own.ownerId, f.ada.id);
  assert.ok(own.churches.some((church) => church.id === f.churchA.id));
  assert.ok(!own.churches.some((church) => church.id === f.churchB.id));
  const request = input(),
    first = await command(db, f.ada.token, request),
    initial = await row(request.id);
  assert.equal(first.id, request.id);
  assert.equal(first.version, 1);
  assert.deepEqual(await command(db, f.ada.token, request), first);
  assert.deepEqual(await row(request.id), initial);
  await denied(
    command(db, f.ada.token, {
      ...request,
      duties: "Changed identical receipt key."
    }),
    409
  );
  const edit = {
    ...request,
    expectedVersion: 1,
    mutationId: randomUUID(),
    duties: "Updated fictional duties."
  };
  const updated = await command(db, f.ada.token, edit);
  assert.equal(updated.version, 2);
  assert.deepEqual(await command(db, f.ada.token, edit), updated);
  await denied(
    command(db, f.ada.token, {
      ...edit,
      mutationId: randomUUID(),
      expectedVersion: 1
    }),
    409
  );
  const current = await detail(db, f.ada.token, {
    churchId: f.churchA.id,
    id: request.id
  });
  assert.equal(current.template.duties, edit.duties);
  assert.equal(current.template.version, 2);
});

test("list pagination is stable, bounded and omits reusable duty bodies", async () => {
  for (let index = 0; index < 21; index++)
    await command(
      db,
      f.ada.token,
      input({ title: `Fictional paged duty ${String(index).padStart(2, "0")}` })
    );
  const a = await list(db, f.ada.token, { churchId: f.churchA.id, page: 0 }),
    b = await list(db, f.ada.token, { churchId: f.churchA.id, page: 1 });
  assert.equal(a.templates.length, 20);
  assert.equal(a.total, b.total);
  assert.ok(b.templates.length > 0);
  assert.equal(
    new Set([...a.templates, ...b.templates].map((value) => value.id)).size,
    a.total
  );
  for (const template of [...a.templates, ...b.templates])
    assert.deepEqual(
      Object.keys(template).sort(),
      ["id", "version", "title", "updatedAt"].sort()
    );
  assert.deepEqual(
    (await list(db, f.ada.token, { churchId: f.churchA.id, page: 0 }))
      .templates,
    a.templates
  );
});

test("apply returns only four duty fields with identity and changes no opportunity or scheduling state", async () => {
  const request = input(),
    saved = await command(db, f.ada.token, request),
    before = await originalState();
  const selected = await apply(db, f.ada.token, applyInput(saved.id));
  assert.equal(selected.ownerId, f.ada.id);
  assert.equal(selected.postId, f.post.id);
  assert.equal(selected.postVersion, f.post.version);
  assert.deepEqual(
    Object.keys(selected.template).sort(),
    ["id", "version", "title", "duties", "requirements", "commitment"].sort()
  );
  assert.deepEqual(selected.template, { id: saved.id, version: 1, ...fields });
  assert.deepEqual(await originalState(), before);
  await denied(
    apply(db, f.ada.token, { ...applyInput(saved.id), expectedVersion: 9 }),
    409
  );
  await denied(
    apply(db, f.ada.token, {
      ...applyInput(saved.id),
      postVersion: f.post.version + 1
    }),
    409
  );
  assert.deepEqual(await originalState(), before);
});

test("templates and applies conceal other churches, noncoordinators and inaccessible recruitment posts", async () => {
  const request = input(),
    saved = await command(db, f.ada.token, request);
  for (const actor of [f.lee, f.blake]) {
    await denied(
      detail(db, actor.token, { churchId: f.churchA.id, id: saved.id }),
      404
    );
    await denied(
      list(db, actor.token, { churchId: f.churchA.id, page: 1 }),
      404
    );
    await denied(apply(db, actor.token, applyInput(saved.id)), 404);
    await denied(command(db, actor.token, input()), 404);
  }
  await denied(
    detail(db, f.ada.token, { churchId: f.churchB.id, id: saved.id }),
    404
  );
  await denied(
    command(db, f.ada.token, input({ churchId: f.churchB.id })),
    404
  );
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchB.id,
      userId: f.blake.id,
      capability: "PUBLISH_CHURCH_POSTS"
    }
  });
  const otherPost = await postCommand(db, f.blake.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchB.id,
    content: "Fictional separate church recruitment.",
    audience: "CHURCH"
  });
  await denied(
    apply(db, f.ada.token, {
      ...applyInput(saved.id),
      postId: otherPost.id,
      postVersion: otherPost.version
    }),
    404
  );
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { moderationState: "HIDDEN" }
  });
  try {
    await denied(apply(db, f.ada.token, applyInput(saved.id)), 404);
  } finally {
    await db.platformPost.update({
      where: { id: f.post.id },
      data: { moderationState: "VISIBLE" }
    });
  }
});

test("current coordinator permission is required before a saved receipt can be replayed", async () => {
  const request = input(),
    saved = await command(db, f.ada.token, request),
    before = await row(saved.id);
  await db.churchCapabilityGrant.deleteMany({
    where: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  try {
    await denied(command(db, f.ada.token, request), 404);
    await denied(
      detail(db, f.ada.token, { churchId: f.churchA.id, id: saved.id }),
      404
    );
    await denied(apply(db, f.ada.token, applyInput(saved.id)), 404);
    assert.deepEqual(await row(saved.id), before);
  } finally {
    await db.churchCapabilityGrant.create({
      data: {
        churchId: f.churchA.id,
        userId: f.ada.id,
        capability: "MANAGE_CHURCH_VOLUNTEERS"
      }
    });
  }
});

test("malformed commands reject version, identifier and unknown-field changes without writing", async () => {
  const baseline = await db.volunteerDutyTemplate.count({
    where: { churchId: f.churchA.id }
  });
  for (const patch of [
    { expectedVersion: -1 },
    { expectedVersion: 1.5 },
    { expectedVersion: Number.MAX_SAFE_INTEGER + 1 },
    { id: "bad id" },
    { churchId: "bad id" },
    { mutationId: "" },
    { capacity: 5 },
    { contact: "not reusable" },
    { operation: "publish" }
  ])
    await denied(() => command(db, f.ada.token, input(patch)), 400);
  assert.equal(
    await db.volunteerDutyTemplate.count({ where: { churchId: f.churchA.id } }),
    baseline
  );
});

test("removal scrubs reusable content and retention replay quarantines a stale restored row", async () => {
  const request = input(),
    saved = await command(db, f.ada.token, request),
    old = await row(saved.id);
  const remove = {
    operation: "remove",
    id: saved.id,
    churchId: f.churchA.id,
    expectedVersion: 1,
    mutationId: randomUUID()
  };
  const removed = await command(db, f.ada.token, remove);
  assert.equal(removed.version, 2);
  assert.deepEqual(await command(db, f.ada.token, remove), removed);
  const cleared = await row(saved.id);
  assert.ok(cleared.removedAt);
  for (const key of ["title", "duties", "requirements", "commitment"] as const)
    assert.equal(cleared[key], "");
  await denied(
    detail(db, f.ada.token, { churchId: f.churchA.id, id: saved.id }),
    404
  );
  await denied(apply(db, f.ada.token, applyInput(saved.id)), 404);
  const control = await db.retentionControl.findFirstOrThrow({
    where: { kind: "VOLUNTEER_DUTY_TEMPLATE", sourceId: saved.id, version: 2 }
  });
  assert.ok(
    !JSON.stringify(control.payload).includes(fields.duties),
    "Retention metadata contains no duty text"
  );
  await db.volunteerDutyTemplate.update({
    where: { id: saved.id },
    data: {
      version: old.version,
      title: old.title,
      duties: old.duties,
      requirements: old.requirements,
      commitment: old.commitment,
      removedAt: null,
      recoveryRequired: false
    }
  });
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  const restored = await row(saved.id);
  assert.equal(restored.recoveryRequired, true);
  for (const key of ["title", "duties", "requirements", "commitment"] as const)
    assert.equal(restored[key], "");
  await denied(
    detail(db, f.ada.token, { churchId: f.churchA.id, id: saved.id }),
    404
  );
  await denied(command(db, f.ada.token, request), 404);
  await replayRetentionControls(db, [
    control.payload as unknown as RetentionControlEntry
  ]);
  assert.deepEqual(await row(saved.id), restored);
});

test("a current coordinator cannot apply another church's template to their editable source", async () => {
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchB.id,
      userId: f.blake.id,
      capability: "MANAGE_CHURCH_VOLUNTEERS"
    }
  });
  const otherPost = await postCommand(db, f.blake.token, {
    operation: "create",
    requestKey: randomUUID(),
    authorChurchId: f.churchB.id,
    content: "Fictional second church duty opportunity.",
    audience: "CHURCH"
  });
  const request = input(),
    saved = await command(db, f.ada.token, request);
  const ownOther = await command(
    db,
    f.blake.token,
    input({ churchId: f.churchB.id })
  );
  assert.equal(
    (
      await apply(db, f.blake.token, {
        id: ownOther.id,
        postId: otherPost.id,
        expectedVersion: 1,
        postVersion: otherPost.version
      })
    ).template.id,
    ownOther.id
  );
  await denied(
    apply(db, f.blake.token, {
      id: saved.id,
      postId: otherPost.id,
      expectedVersion: 1,
      postVersion: otherPost.version
    }),
    404
  );
});

test("storage bounds reject oversized Unicode and active-template capacity can be reclaimed by removal", async () => {
  const before = await db.volunteerDutyTemplate.count();
  await assert.rejects(
    db.volunteerDutyTemplate.create({
      data: { churchId: f.churchA.id, ...fields, title: "😀".repeat(51) }
    })
  );
  await assert.rejects(
    db.volunteerDutyTemplate.create({
      data: { churchId: f.churchA.id, ...fields, version: 0 }
    })
  );
  assert.equal(await db.volunteerDutyTemplate.count(), before);
  const count = await db.volunteerDutyTemplate.count({
    where: { churchId: f.churchA.id, removedAt: null, recoveryRequired: false }
  });
  const fillers = Array.from({ length: 200 - count }, (_, index) => ({
    id: randomUUID(),
    churchId: f.churchA.id,
    ...fields,
    title: `Fictional capacity template ${index}`
  }));
  assert.ok(fillers.length > 0);
  await db.volunteerDutyTemplate.createMany({ data: fillers });
  await denied(command(db, f.ada.token, input()), 409);
  await command(db, f.ada.token, {
    operation: "remove",
    mutationId: randomUUID(),
    id: fillers[0].id,
    churchId: f.churchA.id,
    expectedVersion: 1
  });
  const saved = await command(db, f.ada.token, input());
  assert.equal(saved.version, 1);
  assert.equal(
    await db.volunteerDutyTemplate.count({
      where: {
        churchId: f.churchA.id,
        removedAt: null,
        recoveryRequired: false
      }
    }),
    200
  );
});
