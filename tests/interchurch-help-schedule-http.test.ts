import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, type PortalActor } from "./seed-portal";
import { seedInterchurchHelp, helpAction, type HelpScheduleChoice } from "./seed-interchurch-help";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
before(async () => {
  await assertPortalTestDatabase(db);
  assert.match(origin, /^https:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(process.env.NODE_TLS_REJECT_UNAUTHORIZED, "0");
});
after(() => db.$disconnect());
async function call(path: string, actor: PortalActor, body?: Record<string, unknown>, extra: Record<string, string> = {}) {
  const response = await fetch(origin + path, {
    redirect: "manual", method: body ? "POST" : "GET",
    headers: {
      cookie: `${sessionCookieFixtureName(origin)}=${actor.token}`,
      origin, "x-expected-account": actor.id,
      ...(body ? { "content-type": "application/json" } : {}), ...extra
    }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  return response;
}
const apiBody = (body: ReturnType<typeof helpAction>) => ({ ...body, operation: "help-" + body.operation });
async function choices(actor: PortalActor, offerId: string, kind = "EVENT") {
  const response = await call(`/api/platform/exchange?view=help-schedule&id=${offerId}&category=${kind}`, actor);
  assert.equal(response.status, 200);
  const body = await response.json() as { view: string; owner: string; choices: HelpScheduleChoice[]; next: string | null };
  assert.equal(body.view, "schedule");
  assert.equal(body.owner, actor.id);
  assert.ok(body.choices.length <= 20);
  return body;
}

test("built HTTPS schedule choices and linking enforce account, source, origin and exact retries", async () => {
  const f = await seedInterchurchHelp(db), offerId = await f.offer();
  const offered = await choices(f.manager, offerId);
  const choice = offered.choices.find(row => row.id === f.occurrence.id);
  assert.ok(choice);
  assert.match(choice.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok((await choices(f.responder, offerId)).choices.some(row => row.id === choice.id));
  assert.equal((await call(`/api/platform/exchange?view=help-schedule&id=${offerId}&category=EVENT`, f.outsider)).status, 404);
  assert.equal((await call(`/api/platform/exchange?view=help-schedule&id=${offerId}&category=EVENT`, f.manager,
    undefined, { "x-expected-account": f.responder.id })).status, 401);
  assert.equal((await call(`/api/platform/exchange?view=help-schedule&id=${offerId}&category=EVENT&category=VOLUNTEER_SLOT`, f.manager)).status, 400);
  const before = await f.agreement(offerId), participation = await f.participation();
  const body = apiBody(await f.linkInput(offerId, choice));
  assert.equal((await call("/api/platform/exchange", f.manager, body, { origin: "https://unrelated.example.test" })).status, 403);
  assert.equal((await call("/api/platform/exchange", f.manager, body, { "x-expected-account": f.responder.id })).status, 401);
  assert.deepEqual(await f.agreement(offerId), before);
  const saved = await call("/api/platform/exchange", f.manager, body);
  assert.ok([200, 202].includes(saved.status));
  const receipt = await saved.json();
  const linked = await f.agreement(offerId);
  assert.equal(linked.state, "NEEDS_REVIEW");
  assert.equal(linked.requesterAcknowledged, null);
  assert.equal(linked.responderAcknowledged, null);
  const retried = await call("/api/platform/exchange", f.manager, body);
  assert.ok([200, 202].includes(retried.status));
  assert.deepEqual(await retried.json(), receipt);
  assert.deepEqual(await f.agreement(offerId), linked);
  assert.deepEqual(await f.participation(), participation);
});

test("built calendar edit invalidates help before HTTPS reads or stale acknowledgment can reuse it", async () => {
  const f = await seedInterchurchHelp(db), offerId = await f.offer();
  const choice = (await choices(f.manager, offerId)).choices.find(row => row.id === f.occurrence.id)!;
  assert.ok(choice);
  const linkedResponse = await call("/api/platform/exchange", f.manager, apiBody(await f.linkInput(offerId, choice)));
  assert.ok([200, 202].includes(linkedResponse.status));
  await f.confirm(offerId);
  const agreed = await f.agreement(offerId);
  const event = await db.calendarEvent.findUniqueOrThrow({ where: { id: f.event.id } });
  const row = await db.calendarOccurrence.findUniqueOrThrow({ where: { id: f.occurrence.id } });
  const moved = await call("/api/platform/calendars", f.manager, {
    operation: "edit-event", eventId: event.id, expectedVersion: event.version,
    scope: "OCCURRENCE", occurrenceId: row.id, occurrenceVersion: row.version,
    title: row.title, description: row.description, location: row.location,
    onlineUrl: row.onlineUrl, organizer: row.organizer, allDay: false, timeZone: row.timeZone,
    startLocal: new Date(row.startAt.getTime() + 30 * 60000).toISOString().slice(0, 16),
    endLocal: new Date(row.endAt.getTime() + 30 * 60000).toISOString().slice(0, 16)
  });
  assert.ok([200, 202].includes(moved.status), "Actual built calendar route accepts the material edit");
  const stale = await f.agreement(offerId);
  assert.equal(stale.state, "NEEDS_REVIEW");
  assert.ok(stale.termsVersion > agreed.termsVersion);
  assert.equal(stale.requesterAcknowledged, null);
  assert.equal(stale.responderAcknowledged, null);
  const denied = await call("/api/platform/exchange", f.responder, apiBody(helpAction("acknowledge", {
    offerId, expectedVersion: stale.version, termsVersion: stale.termsVersion,
    requestTermsVersion: stale.requestTermsVersion, acceptTerms: true, externalNotices: false
  })));
  assert.equal(denied.status, 409);
  const current = (await choices(f.manager, offerId)).choices.find(item => item.id === row.id);
  assert.ok(current);
  assert.notEqual(current.fingerprint, choice.fingerprint);
  assert.notEqual(current.startLocal, choice.startLocal);
  assert.equal((stale.terms as Record<string, unknown>).startLocal, choice.startLocal);
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    const response = await fetch(origin + `/platform/exchange/help/offers?id=${offerId}`, {
      headers: { cookie: `${sessionCookieFixtureName(origin)}=${f.responder.token}`, ...headers }, redirect: "manual"
    });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(choice.id), "Private linked source must not enter server HTML/RSC");
    assert.ok(!text.includes(choice.fingerprint));
    assert.ok(!text.includes(f.manager.email));
  }
});

test("built schedule endpoint conceals both participants' revoked source access", async () => {
  const f = await seedInterchurchHelp(db), offerId = await f.offer();
  const before = (await choices(f.manager, offerId)).choices;
  assert.ok(before.some(row => row.id === f.occurrence.id));
  await db.churchConnection.update({ where: { userId_churchId: { userId: f.responder.id, churchId: f.church.id } },
    data: { state: "REMOVED", version: { increment: 1 } } });
  const after = await choices(f.manager, offerId);
  const text = JSON.stringify(after);
  assert.ok(!text.includes(f.occurrence.id));
  assert.ok(!text.includes(before[0].title));
  const rejected = await call("/api/platform/exchange", f.manager,
    apiBody(await f.linkInput(offerId, before.find(row => row.id === f.occurrence.id)!)));
  assert.ok([404, 409].includes(rejected.status));
});
