import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { seedSupport, requestInput } from "./seed-support";
import { createPortalActor, seedOperatorGrants } from "./seed-portal";
import {
  supportCommand,
  readSupport,
  SupportError
} from "../lib/platform/support";
import { readAdminNavigation } from "../lib/platform/admin-authority";
import { readAdminOverview } from "../lib/platform/admin-overview";
import { readAdminQueue } from "../lib/platform/admin-queue";
import {
  adminCaseCommand,
  adminSavedViewCommand
} from "../lib/platform/admin-cases";
import { PortalError } from "../lib/platform/portal-policy";
import { readAdminDetail } from "../lib/platform/admin-detail";
import { handleAdminRequest } from "../lib/platform/admin-boundary";
import { adminBulkCommand } from "../lib/platform/admin-bulk";
import { accountConfig } from "../lib/platform/account-config";
import {
  recordAdminPrivacyControl,
  replayRetentionControls,
  type RetentionControlEntry
} from "../lib/platform/retention-controls";
import {
  eraseAdminPersonalData,
  protectAdminCaseChanges
} from "../lib/platform/admin-privacy";
const db = new PrismaClient();
let f: Awaited<ReturnType<typeof seedSupport>>;
const deny = (p: Promise<unknown>, status = 404) =>
  assert.rejects(
    p,
    (e: unknown) =>
      (e instanceof PortalError || e instanceof SupportError) &&
      e.status === status
  );
before(async () => {
  f = await seedSupport(db);
});
after(() => db.$disconnect());
const create = async () =>
  supportCommand(db, f.memberA.token, await requestInput(db, f.memberA.token));
const change = (
  id: string,
  version: number,
  operation: string,
  extra: Record<string, unknown> = {}
) => ({
  operation,
  requestKey: randomUUID(),
  sourceType: "SUPPORT",
  sourceId: id,
  expectedVersion: version,
  ...extra
});

test("admin navigation and every queue query retain distinct current capabilities", async () => {
  const c = await create();
  await deny(readAdminNavigation(db, f.memberA.token));
  await deny(readAdminQueue(db, f.memberA.token));
  const metrics = await createPortalActor(db, "adminmetric");
  await seedOperatorGrants(db, metrics, ["VIEW_PLATFORM_METRICS"]);
  const nav = await readAdminNavigation(db, metrics.token);
  assert.deepEqual(
    nav.sections.map((s) => s.key),
    ["overview", "growth"]
  );
  await deny(readAdminQueue(db, metrics.token));
  const queue = await readAdminQueue(db, f.owner.token);
  assert.ok(queue.rows.some((r) => r.sourceId === c.caseId && r.canRead));
  assert.ok(!JSON.stringify(queue).includes("Fictional private description"));
  const overview = await readAdminOverview(db, f.owner.token);
  assert.ok(overview.requests!.open >= 1);
  assert.equal((await readAdminOverview(db, metrics.token)).requests, null);
  assert.equal((await readAdminOverview(db, f.backup.token)).requests!.open, 0);
  await deny(readAdminOverview(db, f.memberA.token));

  assert.ok(
    !(await readAdminQueue(db, f.backup.token)).rows.some(
      (r) => r.sourceId === c.caseId
    )
  );
  const revoked = await db.platformOperatorGrant.update({
    where: {
      userId_capability: {
        userId: metrics.id,
        capability: "VIEW_PLATFORM_METRICS"
      }
    },
    data: { revokedAt: new Date() }
  });
  assert.equal(revoked.version, 2);
  await deny(readAdminNavigation(db, metrics.token));
  const renewed = await db.platformOperatorGrant.update({
    where: { id: revoked.id },
    data: { revokedAt: null }
  });
  assert.equal(renewed.version, 3);
  await assert.rejects(
    db.platformOperatorGrant.update({
      where: { id: renewed.id },
      data: { userId: f.memberA.id }
    })
  );
});

test("routing sees only unassigned metadata and never opens private text, notes or unrelated reports", async () => {
  const c = await create();
  await db.supportCase.update({
    where: { id: c.caseId },
    data: { ownerGrantId: null, ownerGrantVersion: null }
  });
  const queue = await readAdminQueue(db, f.manager.token);
  const row = queue.rows.find((r) => r.sourceId === c.caseId)!;
  assert.ok(row);
  assert.equal(row.canRead, false);
  assert.equal(row.title, "Unassigned ordinary help request");
  assert.equal(row.nextAction, "");
  assert.deepEqual(row.tags, []);
  await deny(
    adminCaseCommand(
      db,
      f.manager.token,
      change(c.caseId, row.version, "note", { body: "Must not save" })
    )
  );
  assert.equal(
    await db.adminCaseNote.count({ where: { supportCaseId: c.caseId } }),
    0
  );
});

test("internal notes are immutable, private, idempotent and concurrency-checked", async () => {
  const c = await create(),
    input = change(c.caseId, c.version, "note", {
      body: "Private reviewer note; never a requester reply."
    });
  const [a, b] = await Promise.all([
    adminCaseCommand(db, f.owner.token, input),
    adminCaseCommand(db, f.owner.token, input)
  ]);
  assert.equal(a.version, b.version);
  assert.equal(
    await db.adminCaseNote.count({ where: { supportCaseId: c.caseId } }),
    1
  );
  assert.equal(
    await db.supportMessage.count({ where: { caseId: c.caseId } }),
    0
  );
  const requester = await readSupport(db, f.memberA.token, "detail", {
    caseId: c.caseId
  });
  assert.ok(!JSON.stringify(requester).includes("Private reviewer note"));
  await deny(
    adminCaseCommand(db, f.owner.token, { ...input, body: "Changed retry" }),
    409
  );
  await deny(
    adminCaseCommand(
      db,
      f.owner.token,
      change(c.caseId, c.version, "note", { body: "Stale writer" })
    ),
    409
  );
  const note = await db.adminCaseNote.findFirstOrThrow({
    where: { supportCaseId: c.caseId }
  });
  await assert.rejects(
    db.adminCaseNote.update({
      where: { id: note.id },
      data: { body: "Not a redaction" }
    })
  );
  await assert.rejects(
    db.adminCaseNote.update({
      where: { id: note.id },
      data: { reportId: "other" }
    })
  );
  await adminCaseCommand(
    db,
    f.owner.token,
    change(c.caseId, Number(a.version), "redact-note", {
      noteId: note.id,
      reason: "PRIVATE_INFORMATION"
    })
  );
  assert.equal(
    (await db.adminCaseNote.findUniqueOrThrow({ where: { id: note.id } })).body,
    "[Removed for privacy.]"
  );
});

test("saved filters stay private and unchanged retries do not create duplicates", async () => {
  const input = {
    operation: "save-view",
    requestKey: randomUUID(),
    name: "My oldest high priority",
    filters: { type: "SUPPORT", owner: "ME", age: "7", priority: "HIGH" }
  };
  const a = await adminSavedViewCommand(db, f.owner.token, input),
    b = await adminSavedViewCommand(db, f.owner.token, input);
  assert.equal(a.id, b.id);
  const own = await readAdminQueue(db, f.owner.token);
  assert.ok(own.savedViews.some((v) => v.id === a.id));
  assert.ok(
    !(await readAdminQueue(db, f.backup.token)).savedViews.some(
      (v) => v.id === a.id
    )
  );
  await deny(
    adminSavedViewCommand(db, f.backup.token, {
      operation: "delete-view",
      requestKey: randomUUID(),
      id: a.id,
      expectedVersion: 1
    })
  );
  await deny(readAdminQueue(db, f.owner.token, { privateBody: "search" }), 400);
  await deny(readAdminQueue(db, f.owner.token, {}, "broken"), 400);
});

test("one ordered queue traverses all batches without exposing foreign church or verification data", async () => {
  const stamp = new Date(Date.now() - 1000);
  const ids: string[] = [];
  for (let i = 0; i < 32; i++) {
    const r = await db.supportCase.create({
      data: {
        requesterId: f.memberA.id,
        ownerGrantId: f.ownerGrant.id,
        ownerGrantVersion: f.ownerGrant.version,
        category: "ACCOUNT_WEBSITE",
        subject: "Admin page fixture " + i,
        description: "Never a queue body",
        createdAt: new Date(stamp.getTime() - i * 1000)
      },
      select: { id: true }
    });
    ids.push(r.id);
  }
  const seen = new Set<string>();
  let after: string | null = null;
  do {
    const page = await readAdminQueue(
      db,
      f.owner.token,
      { q: "Admin page fixture" },
      after
    );
    assert.ok(page.rows.length <= 25);
    for (const r of page.rows) {
      assert.ok(!seen.has(r.sourceId));
      seen.add(r.sourceId);
    }
    after = page.next;
  } while (after);
  assert.equal(seen.size, 32);
  assert.deepEqual([...seen].sort(), ids.sort());
  const reviewer = await createPortalActor(db, "adminreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  const publicReport = await db.communityReport.create({
    data: {
      reporterId: f.memberA.id,
      targetType: "PROFILE",
      targetId: f.memberB.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Private report details"
    }
  });
  const churchReport = await db.communityReport.create({
    data: {
      reporterId: f.memberA.id,
      targetType: "PROFILE",
      targetId: f.contact.id,
      targetVersion: 1,
      scopeChurchId: f.churchA.id,
      reason: "PRIVACY",
      details: "Other church private notes"
    }
  });
  const queue = await readAdminQueue(db, reviewer.token);
  assert.ok(queue.rows.some((r) => r.sourceId === publicReport.id));
  assert.ok(!queue.rows.some((r) => r.sourceId === churchReport.id));
  assert.ok(!JSON.stringify(queue).includes("Private report details"));
  assert.ok(
    !(await readAdminQueue(db, f.owner.token)).rows.some(
      (r) => r.sourceType === "REPORT"
    )
  );
});

test("duplicate grouping preserves two separate requester receipts and is versioned", async () => {
  const first = await createPortalActor(db, "adminfirst"),
    second = await createPortalActor(db, "adminsecond");
  const a = await supportCommand(
      db,
      first.token,
      await requestInput(db, first.token)
    ),
    b = await supportCommand(
      db,
      second.token,
      await requestInput(db, second.token)
    );
  const input = change(a.caseId, a.version, "group", {
    relatedSourceType: "SUPPORT",
    relatedSourceId: b.caseId,
    relatedVersion: b.version,
    title: "Same fictional screen defect",
    engineeringUrl: ""
  });
  await adminCaseCommand(db, f.owner.token, input);
  await adminCaseCommand(db, f.owner.token, input);
  const rows = await db.supportCase.findMany({
    where: { id: { in: [a.caseId, b.caseId] } }
  });
  assert.equal(rows.length, 2);
  assert.ok(rows[0].adminGroupId);
  assert.equal(rows[0].adminGroupId, rows[1].adminGroupId);
  assert.equal(
    await db.supportMessage.count({
      where: { caseId: { in: [a.caseId, b.caseId] } }
    }),
    0
  );
  const own = await readSupport(db, first.token, "detail", {
    caseId: a.caseId
  });
  assert.ok(!JSON.stringify(own).includes("Same fictional screen defect"));
  await deny(readSupport(db, first.token, "detail", { caseId: b.caseId }));
  const detail = await readAdminDetail(db, f.owner.token, {
    sourceType: "SUPPORT",
    sourceId: a.caseId
  });
  assert.equal(detail.group?.affectedAccounts, 2);
  assert.equal(detail.group?.rows.length, 2);
  const third = await supportCommand(
    db,
    first.token,
    await requestInput(db, first.token)
  );
  await adminCaseCommand(
    db,
    f.owner.token,
    change(third.caseId, third.version, "group", {
      relatedSourceType: "SUPPORT",
      relatedSourceId: a.caseId,
      relatedVersion: detail.row.version,
      title: "Must not replace existing group",
      engineeringUrl: ""
    })
  );
  const joined = await readAdminDetail(db, f.owner.token, {
    sourceType: "SUPPORT",
    sourceId: third.caseId
  });
  assert.equal(joined.group?.rows.length, 3);
  assert.equal(joined.group?.title, "Same fictional screen defect");
  await adminCaseCommand(
    db,
    f.owner.token,
    change(third.caseId, joined.row.version, "ungroup")
  );
  assert.equal(
    (
      await readAdminDetail(db, f.owner.token, {
        sourceType: "SUPPORT",
        sourceId: third.caseId
      })
    ).group,
    null
  );
  assert.ok(
    (
      await readAdminDetail(db, f.owner.token, {
        sourceType: "SUPPORT",
        sourceId: b.caseId
      })
    ).history.some((h) => h.action === "group")
  );
  const groupId = joined.row.adminGroupId!;
  assert.equal(
    (await db.adminCaseGroup.findUniqueOrThrow({ where: { id: groupId } }))
      .title,
    "[Group details removed.]"
  );
  for (const id of [a.caseId, b.caseId]) {
    const current = await db.supportCase.findUniqueOrThrow({ where: { id } });
    await adminCaseCommand(
      db,
      f.owner.token,
      change(id, current.version, "ungroup")
    );
  }
  assert.equal(
    await db.adminCaseGroup.count({ where: { id: groupId } }),
    0,
    "Removing the last member leaves no orphan group text"
  );
});

const adminRequest = (
  token: string,
  owner: string,
  body?: Record<string, unknown>,
  query = "view=navigation"
) =>
  new Request(accountConfig().origin + "/api/platform/admin?" + query, {
    method: body ? "POST" : "GET",
    headers: {
      Cookie: `church_platform_session=${token}`,
      Origin: accountConfig().origin,
      "Content-Type": "application/json",
      "X-Expected-Account": owner
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
test("admin request boundary denies cross-account, cross-origin, unsupported and absent privileges with no-store responses", async () => {
  for (const request of [
    adminRequest(f.memberA.token, f.memberA.id),
    adminRequest(f.owner.token, f.memberB.id),
    adminRequest(f.owner.token, f.owner.id, undefined, "view=health")
  ]) {
    const result = await handleAdminRequest(db, request);
    assert.ok([401, 404].includes(result.status));
    assert.match(result.headers.get("Cache-Control")!, /no-store/);
    assert.match(result.headers.get("Vercel-CDN-Cache-Control")!, /no-store/);
  }
  const invalid = adminRequest(f.owner.token, f.owner.id, {
    operation: "save-view",
    requestKey: randomUUID(),
    name: "invalid",
    filters: null
  });
  assert.equal((await handleAdminRequest(db, invalid)).status, 400);
  const cross = adminRequest(f.owner.token, f.owner.id, {
    operation: "save-view",
    requestKey: randomUUID(),
    name: "cross",
    filters: {}
  });
  cross.headers.set("origin", "https://untrusted.example");
  assert.equal((await handleAdminRequest(db, cross)).status, 403);
  assert.equal(
    (
      await handleAdminRequest(
        db,
        adminRequest(f.owner.token, f.owner.id, undefined, "view=queue&due=no")
      )
    ).status,
    400
  );
  assert.equal(
    (
      await handleAdminRequest(
        db,
        adminRequest(
          f.owner.token,
          f.owner.id,
          undefined,
          "view=queue&type=ALL&type=REPORT"
        )
      )
    ).status,
    400
  );
});
test("bulk results retain independent row scope, conflicts and exact successful retries", async () => {
  const actor = await createPortalActor(db, "adminbulk");
  const one = await supportCommand(
      db,
      actor.token,
      await requestInput(db, actor.token)
    ),
    two = await supportCommand(
      db,
      actor.token,
      await requestInput(db, actor.token)
    );
  const body = {
    operation: "bulk",
    requestKey: randomUUID(),
    action: "tags",
    tags: ["mobile"],
    rows: [
      {
        sourceType: "SUPPORT",
        sourceId: one.caseId,
        expectedVersion: one.version
      },
      {
        sourceType: "SUPPORT",
        sourceId: two.caseId,
        expectedVersion: two.version + 1
      },
      {
        sourceType: "SUPPORT",
        sourceId: "absent-private-case",
        expectedVersion: 1
      }
    ]
  };
  const request = adminRequest(f.owner.token, f.owner.id, body);
  const result = await adminBulkCommand(db, request, f.owner.token, body);
  assert.deepEqual(
    result.results.map((r) => r.status),
    [200, 409, 404]
  );
  const again = await adminBulkCommand(db, request, f.owner.token, body);
  assert.deepEqual(again, result);
  assert.deepEqual(
    (await db.supportCase.findUniqueOrThrow({ where: { id: one.caseId } }))
      .triageTags,
    ["mobile"]
  );
  assert.deepEqual(
    (await db.supportCase.findUniqueOrThrow({ where: { id: two.caseId } }))
      .triageTags,
    []
  );
  await deny(
    adminBulkCommand(db, request, f.owner.token, {
      ...body,
      action: "approve"
    }),
    400
  );
  const status = {
    operation: "bulk",
    requestKey: randomUUID(),
    action: "status",
    status: "RESOLVED",
    reason: "Verified isolated fix completed.",
    rows: [
      {
        sourceType: "SUPPORT",
        sourceId: one.caseId,
        expectedVersion: one.version + 1
      }
    ]
  };
  assert.equal(
    (
      await adminBulkCommand(
        db,
        adminRequest(f.owner.token, f.owner.id, status),
        f.owner.token,
        status
      )
    ).results[0].status,
    200
  );
  assert.equal(
    (await readSupport(db, actor.token, "detail", { caseId: one.caseId }))
      .detail?.status,
    "RESOLVED"
  );
});
test("newer private admin controls clear stale internal text without forging a native case or appeal version", async () => {
  const actor = await createPortalActor(db, "adminprivacy");
  const source = await db.supportCase.create({
    data: {
      requesterId: actor.id,
      ownerGrantId: f.ownerGrant.id,
      ownerGrantVersion: f.ownerGrant.version,
      category: "ACCOUNT_WEBSITE",
      subject: "Canonical original",
      description: "Requester receipt remains",
      version: 5,
      adminVersion: 1,
      nextAction: "Old private internal detail",
      bugSteps: "Old reproduction private text"
    }
  });
  const note = await db.adminCaseNote.create({
    data: {
      supportCaseId: source.id,
      actorId: f.owner.id,
      body: "Old internal secret",
      sourceVersion: 5
    }
  });
  await db.$transaction((tx) =>
    recordAdminPrivacyControl(
      tx,
      { sourceType: "SUPPORT", sourceId: source.id },
      f.owner.id,
      2
    )
  );
  await deny(
    protectAdminCaseChanges(db, [source.id], {
      record: async () => {
        throw Error("isolated provider unavailable");
      }
    }),
    503
  );
  const entries = await db.retentionControl.findMany({
    where: { kind: "ADMIN_SUPPORT", sourceId: source.id }
  });
  assert.ok(!JSON.stringify(entries).includes("Old internal secret"));
  await replayRetentionControls(
    db,
    entries.map((e) => e.payload as RetentionControlEntry)
  );
  const current = await db.supportCase.findUniqueOrThrow({
    where: { id: source.id }
  });
  assert.equal(current.version, 5);
  assert.equal(current.adminVersion, 2);
  assert.equal(current.description, "Requester receipt remains");
  assert.equal(current.nextAction, "");
  assert.equal(current.bugSteps, "");
  assert.equal(
    (await db.adminCaseNote.findUniqueOrThrow({ where: { id: note.id } })).body,
    "[Removed for privacy.]"
  );
  await replayRetentionControls(
    db,
    entries.map((e) => e.payload as RetentionControlEntry)
  );
  await db.adminSavedView.create({
    data: {
      userId: actor.id,
      name: "Private removed view",
      filters: { q: "personal" }
    }
  });
  await db.$transaction((tx) =>
    eraseAdminPersonalData(tx, actor.id, new Date())
  );
  assert.equal(
    await db.adminSavedView.count({ where: { userId: actor.id } }),
    0
  );
});

test("revoked then renewed reviewer grants cannot revive an old assignment or distort owner filters", async () => {
  const reviewer = await createPortalActor(db, "ownerreview"),
    other = await createPortalActor(db, "otherreview"),
    reporter = await createPortalActor(db, "ownreporter");
  await seedOperatorGrants(db, reviewer, ["REVIEW_COMMUNITY_REPORTS"]);
  await seedOperatorGrants(db, other, ["REVIEW_COMMUNITY_REPORTS"]);
  const report = await db.communityReport.create({
    data: {
      reporterId: reporter.id,
      targetType: "PROFILE",
      targetId: f.memberB.id,
      targetVersion: 1,
      reason: "PRIVACY",
      details: "Private original receipt"
    }
  });
  const input = {
    operation: "assign",
    requestKey: randomUUID(),
    sourceType: "REPORT",
    sourceId: report.id,
    expectedVersion: 1,
    username: other.username
  };
  await adminCaseCommand(db, reviewer.token, input);
  assert.equal(
    (await readAdminQueue(db, other.token, { owner: "ME" })).rows.find(
      (r) => r.sourceId === report.id
    )?.ownerId,
    other.id
  );
  const grant = await db.platformOperatorGrant.findUniqueOrThrow({
    where: {
      userId_capability: {
        userId: other.id,
        capability: "REVIEW_COMMUNITY_REPORTS"
      }
    }
  });
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: null }
  });
  const queue = await readAdminQueue(db, reviewer.token, {
    owner: "UNASSIGNED"
  });
  const unassigned = queue.rows.find((r) => r.sourceId === report.id);
  assert.ok(unassigned);
  assert.equal(unassigned.ownerId, null);
  assert.equal(unassigned.ownerName, null);
  assert.equal(unassigned.state, "NEW");
  assert.ok(
    !(await readAdminQueue(db, other.token, { owner: "ME" })).rows.some(
      (r) => r.sourceId === report.id
    )
  );
  await adminCaseCommand(db, reviewer.token, {
    ...input,
    requestKey: randomUUID(),
    expectedVersion: 2
  });
  assert.equal(
    (await readAdminQueue(db, other.token, { owner: "ME" })).rows.find(
      (r) => r.sourceId === report.id
    )?.ownerId,
    other.id
  );
  assert.ok(!JSON.stringify(queue).includes("assignedReviewerProof"));
});
