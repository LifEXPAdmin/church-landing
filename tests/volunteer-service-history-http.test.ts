import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { request as httpsRequest } from "node:https";
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants
} from "./seed-portal";
import {
  seedVolunteerApplications,
  volunteerAction
} from "./seed-volunteer-applications";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import type { VolunteerServiceRecord } from "../lib/platform/volunteer-service-history";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";

const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
before(async () => {
  await assertPortalTestDatabase(db);
  await seedOperatorGrants(
    db,
    await createPortalActor(db, "servicehttpreview"),
    ["REVIEW_COMMUNITY_REPORTS"]
  );
});
after(() => db.$disconnect());
type Actor = { id: string; token: string; username: string };
const endpoint = "/api/platform/volunteers";

function send(
  path: string,
  actor: Actor | null,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const bytes =
    body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise<{
    status: number;
    headers: import("node:http").IncomingHttpHeaders;
    text: string;
  }>((resolve, reject) => {
    const request = httpsRequest(
      origin + path,
      {
        method: bytes ? "POST" : "GET",
        servername: "localhost",
        timeout: 30000,
        headers: {
          ...(actor
            ? {
                Cookie: `${sessionCookieFixtureName(origin)}=${actor.token}`,
                "X-Expected-Account": actor.id
              }
            : {}),
          ...(bytes
            ? {
                Origin: origin,
                "Content-Type": "application/json",
                "Content-Length": String(bytes.length)
              }
            : {}),
          ...headers
        }
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.once("error", reject);
        response.once("end", () =>
          resolve({
            status: response.statusCode!,
            headers: response.headers,
            text: Buffer.concat(chunks).toString()
          })
        );
      }
    );
    request.once("error", reject);
    request.once("timeout", () =>
      request.destroy(new Error("Fictional volunteer HTTPS timeout"))
    );
    request.end(bytes);
  });
}
function privateJson(response: Awaited<ReturnType<typeof send>>, status = 200) {
  assert.equal(response.status, status, response.text);
  assert.match(String(response.headers["cache-control"]), /private.*no-store/);
  assert.equal(response.headers["cdn-cache-control"], "no-store");
  assert.equal(response.headers["vercel-cdn-cache-control"], "no-store");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(String(response.headers.vary), /X-Expected-Account/i);
  return JSON.parse(response.text);
}
async function seed(timed: boolean) {
  const f = await seedVolunteerApplications(db, timed, 2);
  const application = await volunteerCommand(
    db,
    f.lee.token,
    f.application("Fictional private history statement")
  );
  await volunteerCommand(
    db,
    f.ada.token,
    volunteerAction("accept", {
      id: application.id,
      expectedVersion: application.version,
      ...f.snapshot
    })
  );
  const saved = await db.volunteerApplication.findUniqueOrThrow({
    where: { id: application.id }
  });
  return {
    ...f,
    applicationId: application.id,
    target: {
      kind: timed ? ("signup" as const) : ("application" as const),
      id: saved.signupId ?? saved.id
    }
  };
}
async function own(actor: Actor, id: string) {
  const data = privateJson(await send(endpoint + "?view=history", actor));
  assert.equal(data.ownerId, actor.id);
  const record = (data.items as VolunteerServiceRecord[]).find(
    (row) => row.target.id === id
  );
  assert.ok(record);
  return record;
}
const completion = (record: VolunteerServiceRecord, completed: boolean) =>
  volunteerAction("complete", {
    targetKind: record.target.kind,
    targetId: record.target.id,
    expectedVersion: record.version,
    completed,
    reason: completed
      ? "Fictional private completion note"
      : "Fictional correction after review"
  });
const consent = (record: VolunteerServiceRecord, shared: boolean) =>
  volunteerAction("service-visibility", {
    targetKind: record.target.kind,
    targetId: record.target.id,
    expectedVersion: record.serviceVersion,
    completionVersion: record.completionVersion,
    shared
  });

for (const timed of [true, false]) {
  test(`HTTPS ${timed ? "timed" : "untimed"} completion is private until explicit consent and correction removes it`, async () => {
    const f = await seed(timed);
    const initial = await own(f.lee, f.target.id);
    assert.equal(initial.completed, false);
    assert.equal(initial.shared, false);
    privateJson(await send(endpoint, f.ada, completion(initial, true)));
    const confirmed = await own(f.lee, f.target.id);
    assert.equal(confirmed.completed, true);
    assert.equal(confirmed.shared, false);
    const profilePath = `/platform/profile/${f.lee.username}`;
    const beforeShare = await send(profilePath, f.val);
    assert.equal(beforeShare.status, 200);
    assert.ok(!beforeShare.text.includes("Shared service history"));
    const shareBody = consent(confirmed, true);
    const first = privateJson(await send(endpoint, f.lee, shareBody));
    assert.deepEqual(
      privateJson(await send(endpoint, f.lee, shareBody)),
      first
    );
    const visible = await send(profilePath, f.val);
    assert.equal(visible.status, 200);
    assert.ok(visible.text.includes("Shared service history"));
    for (const privateText of [
      "Fictional private history statement",
      "Fictional private completion note"
    ])
      assert.ok(!visible.text.includes(privateText));
    const guest = await send(profilePath, null);
    assert.ok(!guest.text.includes("Shared service history"));
    const preview = await send(profilePath + "?preview=member", f.lee);
    assert.ok(
      !preview.text.includes("Shared service history"),
      "Member preview has no assumed church access"
    );
    const snapshotPath = `/api/platform/profile?view=member-snapshot&username=${f.lee.username}`;
    const before = JSON.parse((await send(snapshotPath, f.val)).text).snapshot;
    const current = await own(f.lee, f.target.id);
    privateJson(await send(endpoint, f.ada, completion(current, false)));
    const corrected = await own(f.lee, f.target.id);
    assert.equal(corrected.completed, false);
    assert.equal(corrected.shared, false);
    assert.notEqual(
      JSON.parse((await send(snapshotPath, f.val)).text).snapshot,
      before
    );
    assert.ok(
      !(await send(profilePath, f.val)).text.includes("Shared service history")
    );
    const oldRetry = await send(endpoint, f.lee, shareBody);
    assert.ok([403, 404, 409].includes(oldRetry.status), oldRetry.text);
    privateJson(await send(endpoint, f.ada, completion(corrected, true)));
    assert.equal(
      (await own(f.lee, f.target.id)).shared,
      false,
      "Reconfirmation never restores old consent"
    );
  });
}

test("HTTPS service writes reject cross-origin, changed-account, unknown-field and unrelated-owner input", async () => {
  const f = await seed(false),
    record = await own(f.lee, f.target.id);
  const body = completion(record, true);
  privateJson(
    await send(endpoint, f.ada, body, {
      Origin: "https://unrelated.example.invalid"
    }),
    403
  );
  privateJson(
    await send(endpoint, f.ada, body, { "X-Expected-Account": f.lee.id }),
    401
  );
  privateJson(await send(endpoint, f.ada, { ...body, ownerId: f.lee.id }), 400);
  privateJson(
    await send(endpoint, f.ada, { ...body, reason: "x".repeat(17000) }),
    400
  );
  const unrelated = await send(endpoint, f.blake, body);
  assert.ok([403, 404].includes(unrelated.status), unrelated.text);
  assert.equal((await own(f.lee, f.target.id)).completed, false);
  privateJson(await send(endpoint, f.ada, body));
  const current = await own(f.lee, f.target.id);
  const organizerSharing = await send(endpoint, f.ada, consent(current, true));
  assert.ok(
    [403, 404].includes(organizerSharing.status),
    organizerSharing.text
  );
  assert.equal((await own(f.lee, f.target.id)).shared, false);
});

test("HTTPS consent withdrawal remains available after source revocation and old opt-in cannot replay", async () => {
  const f = await seed(false);
  privateJson(
    await send(endpoint, f.ada, completion(await own(f.lee, f.target.id), true))
  );
  const shareBody = consent(await own(f.lee, f.target.id), true);
  privateJson(await send(endpoint, f.lee, shareBody));
  await db.platformPost.update({
    where: { id: f.opportunityPost.id },
    data: { status: "WITHDRAWN" }
  });
  const concealed = await own(f.lee, f.target.id);
  assert.equal(concealed.current, false);
  assert.equal(concealed.postId, null);
  assert.equal(concealed.canHide, true);
  privateJson(await send(endpoint, f.lee, consent(concealed, false)));
  assert.equal((await own(f.lee, f.target.id)).shared, false);
  const replay = await send(endpoint, f.lee, shareBody);
  assert.ok([403, 404, 409].includes(replay.status), replay.text);
});

test("HTTPS coordinator roster and own-history pages have private access checks", async () => {
  const f = await seed(true),
    slot = f.opportunity.slotId!;
  const roster = privateJson(
    await send(endpoint + `?view=service-roster&id=${slot}`, f.ada)
  );
  assert.equal(roster.ownerId, f.ada.id);
  assert.ok(
    roster.people.some(
      (row: { service: VolunteerServiceRecord }) =>
        row.service.target.id === f.target.id
    )
  );
  const denied = await send(
    endpoint + `?view=service-roster&id=${slot}`,
    f.lee
  );
  assert.ok([403, 404].includes(denied.status), denied.text);
  privateJson(await send(endpoint + "?view=history", null), 401);
  for (const path of [
    "/platform/serve/history",
    `/platform/serve/roles/${slot}`
  ]) {
    const page = await send(path, path.includes("roles") ? f.ada : f.lee);
    assert.equal(page.status, 200);
    assert.match(String(page.headers["content-security-policy"]), /nonce-/);
  }
});

async function linkNeed(f: Awaited<ReturnType<typeof seed>>) {
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.val.id,
      capability: "MODERATE_EXCHANGE_LISTINGS"
    }
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId: f.churchA.id,
      userId: f.ada.id,
      capability: "MANAGE_EXCHANGE_LISTINGS"
    }
  });
  await db.socialPreferences.upsert({
    where: { ownerId: f.ada.id },
    create: { ownerId: f.ada.id, contactRequests: "EVERYONE" },
    update: { contactRequests: "EVERYONE" }
  });
  const listing = await db.exchangeListing.create({
    data: {
      ownerChurchId: f.churchA.id,
      creatorId: f.ada.id,
      intent: "CHURCH_NEED",
      category: "HOUSEHOLD",
      title: "Fictional confirmed volunteer help",
      description: "Isolated completion recovery check",
      requestedItems: "Two helpers",
      audience: "CHURCH",
      audienceChurchId: f.churchA.id,
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago"
    }
  });
  const need = await exchangeNeedCommand(
    db,
    f.ada.token,
    volunteerAction("configure", {
      listingId: listing.id,
      listingVersion: listing.version,
      expectedVersion: 0,
      deadlineLocal: new Date(Date.now() + 3 * 86400000)
        .toISOString()
        .slice(0, 16),
      timeZone: "UTC",
      acceptCoordinator: true
    })
  );
  await exchangeNeedCommand(
    db,
    f.ada.token,
    volunteerAction("slot", {
      needId: need.id,
      slotId: randomUUID(),
      expectedVersion: 0,
      schema: NEED_SCHEMA,
      fields: {
        action: "VOLUNTEER",
        label: "Fictional welcome help",
        unit: "places",
        target: 2,
        loan: false,
        returnLocal: null,
        returnTimeZone: null,
        returnResponsibility: "",
        volunteerSlotId: f.opportunity.slotId
      }
    })
  );
  const current = await db.exchangeListing.findUniqueOrThrow({
    where: { id: listing.id }
  });
  await exchangeListingCommand(
    db,
    f.ada.token,
    volunteerAction("status", {
      listingId: listing.id,
      expectedVersion: current.version,
      state: "ACTIVE",
      itemPolicy: EXCHANGE_ITEM_POLICY,
      itemConfirmed: true
    })
  );
  return need.id;
}

// The real server and this suite share only this explicitly isolated journal.
// Keep all prior fictional evidence; a temporary file makes its folder unavailable.
async function unavailableJournal<T>(work: () => Promise<T>) {
  const root = resolve(process.env.RETENTION_TEST_DIR!);
  assert.ok(root.startsWith(resolve(".account-test") + sep));
  assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
  const folder = resolve(root, "retention-v1/controls"),
    retained = folder + "-retained-" + randomUUID();
  await mkdir(folder, { recursive: true });
  await rename(folder, retained);
  try {
    await writeFile(folder, "Fictional unavailable journal fixture", {
      flag: "wx"
    });
    return await work();
  } finally {
    await unlink(folder);
    await rename(retained, folder);
  }
}

for (const linked of [false, true]) {
  test(`HTTPS ${linked ? "Need-linked" : "direct"} completion reports pending journal protection and exact retry protects the volunteer owner`, async () => {
    const f = await seed(linked),
      record = await own(f.lee, f.target.id);
    const needId = linked ? await linkNeed(f) : null;
    const path = linked ? "/api/platform/exchange" : endpoint;
    const body = linked
      ? volunteerAction("need-complete-volunteer", {
          needId,
          signupId: record.target.id,
          expectedVersion: record.version,
          completed: true,
          reason: ""
        })
      : completion(record, true);
    const pending = await unavailableJournal(async () =>
      privateJson(await send(path, f.ada, body), 202)
    );
    assert.match(pending.message, /Protected recovery is pending/);
    assert.deepEqual(Object.keys(pending).sort(), ["id", "message", "version"]);
    assert.ok(!JSON.stringify(pending).includes(f.lee.id));
    const completed = await own(f.lee, f.target.id);
    assert.equal(completed.completed, true);
    assert.equal(completed.shared, false);
    const control = await db.retentionControl.findFirstOrThrow({
      where: {
        sourceId: f.target.id,
        kind: linked
          ? "VOLUNTEER_SERVICE_SIGNUP"
          : "VOLUNTEER_SERVICE_APPLICATION"
      },
      orderBy: { version: "desc" }
    });
    assert.equal(control.targetId, f.lee.id);
    assert.equal(control.journaledAt, null);
    const recovered = privateJson(await send(path, f.ada, body));
    assert.equal(recovered.id, pending.id);
    assert.equal(recovered.version, pending.version);
    assert.ok(!recovered.message.includes("pending"));
    assert.ok(
      (
        await db.retentionControl.findUniqueOrThrow({
          where: { id: control.id }
        })
      ).journaledAt
    );
    assert.equal(
      (await own(f.lee, f.target.id)).completionVersion,
      completed.completionVersion
    );
  });
}
