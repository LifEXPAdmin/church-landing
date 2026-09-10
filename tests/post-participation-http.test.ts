import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { calendarCommand } from "../lib/platform/calendar-commands";
const db = new PrismaClient(),
  origin = process.env.ACCOUNT_ORIGIN!,
  production = process.env.POST_RENDER_PHASE === "production";
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const send = (token: string, input: Record<string, unknown>, source = origin) =>
  fetch(origin + "/api/platform/participation", {
    method: "POST",
    headers: {
      Origin: source,
      Cookie: "church_platform_session=" + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
test("actual participation API and HTML/RSC hide church polls, roles and rosters from outsiders", async () => {
  const f = await seedParticipation(db);
  await f.poll({ question: "PRIVATE POLL " + f.churchA.id });
  const slot = await f.slot({ role: "PRIVATE ROLE " + f.churchA.id });
  for (const token of ["", f.blake.token]) {
    assert.equal(
      (await get("/api/platform/participation?postId=" + f.post.id, token))
        .status,
      404
    );
    assert.equal(
      (
        await get(
          "/api/platform/participation?view=roster&slotId=" + slot.id,
          token
        )
      ).status,
      404
    );
    for (const path of [
      "/platform",
      "/platform/posts/" + f.post.id,
      "/platform/search?q=" + f.churchA.id
    ])
      for (const rsc of [false, true]) {
        const body = await (await get(path, token, rsc)).text();
        assert.ok(!body.includes("PRIVATE POLL"));
        assert.ok(!body.includes("PRIVATE ROLE"));
      }
  }
  const response = await get(
    "/api/platform/participation?postId=" + f.post.id,
    f.lee.token
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
  const body = await response.text();
  assert.ok(body.includes("PRIVATE POLL"));
  assert.ok(!body.includes(f.ada.id));
  assert.ok(!body.includes(f.ada.email));
  assert.ok(!body.includes("requestKey"));
  for (const rsc of [false, true]) {
    const body = await (
      await get("/platform/posts/" + f.post.id, f.lee.token, rsc)
    ).text();
    assert.equal(body.includes("PRIVATE POLL"), production);
    assert.ok(!body.includes("Show authorized roster"));
    assert.ok(!body.includes(f.ada.email));
  }
  assert.equal(
    (
      await get(
        "/api/platform/participation?view=roster&slotId=" + slot.id,
        f.lee.token
      )
    ).status,
    403
  );
});
test("real endpoints preserve one ballot and one final place across retries, reloads and cancellation", async () => {
  const f = await seedParticipation(db);
  await f.poll();
  const slot = await f.slot();
  const view = await (
    await get("/api/platform/participation?postId=" + f.post.id, f.lee.token)
  ).json();
  const vote = {
    operation: "vote",
    postId: f.post.id,
    pollVersion: 1,
    expectedVersion: 0,
    optionIds: [view.poll.options[0].id]
  };
  assert.equal(
    (await send(f.lee.token, vote, "https://wrong.example")).status,
    403
  );
  assert.equal(
    (await send(f.lee.token, { ...vote, userId: f.val.id })).status,
    400
  );
  assert.equal((await send(f.lee.token, vote)).status, 200);
  assert.equal((await send(f.lee.token, vote)).status, 200);
  assert.equal(
    await db.postPollBallot.count({ where: { pollId: view.poll.id } }),
    1
  );
  assert.equal(
    (
      await send(f.lee.token, {
        ...vote,
        expectedVersion: 1,
        optionIds: [view.poll.options[1].id]
      })
    ).status,
    200
  );
  const changed = await (
    await get("/api/platform/participation?postId=" + f.post.id, f.lee.token)
  ).json();
  assert.equal(changed.poll.total, 1);
  assert.equal(changed.poll.options[1].count, 1);
  assert.equal(changed.poll.ballot.version, 2);
  const signup = {
    operation: "volunteer",
    postId: f.post.id,
    slotId: slot.id,
    slotVersion: 1,
    expectedVersion: 0
  };
  const responses = await Promise.all([
    send(f.val.token, signup),
    send(f.morgan.token, signup)
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
  const winner = responses[0].status === 200 ? f.val : f.morgan,
    other = winner === f.val ? f.morgan : f.val;
  const saved = await (await send(winner.token, signup)).json();
  assert.equal(
    await db.postVolunteerSignup.count({
      where: { slotId: slot.id, state: "ACTIVE" }
    }),
    1
  );
  const from = new Date().toISOString().slice(0, 10),
    until = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const commitments = await (
    await get(
      `/api/platform/calendars?view=commitments&from=${from}&until=${until}&timeZone=UTC`,
      winner.token
    )
  ).json();
  assert.equal(commitments.volunteerCommitments[0].id, saved.id);
  if (production) {
    const expectedTime = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Chicago"
    }).format(f.occurrence.startAt);
    const page = await (
      await get(
        `/platform/commitments?month=${f.occurrence.startLocal.slice(0, 7)}&timeZone=America%2FChicago`,
        winner.token
      )
    ).text();
    assert.ok(
      page.includes(expectedTime),
      "Volunteer commitments must use the selected viewing zone"
    );
  }
  assert.equal(
    (
      await send(winner.token, {
        operation: "cancel-volunteer",
        signupId: saved.id,
        expectedVersion: saved.version
      })
    ).status,
    200
  );
  assert.equal((await send(other.token, signup)).status, 200);
  const roster = await (
    await get(
      "/api/platform/participation?view=roster&slotId=" + slot.id,
      f.ada.token
    )
  ).json();
  assert.equal(roster.total, 1);
  assert.ok(!JSON.stringify(roster).includes(other.email));
  assert.equal(
    (
      await send(f.ada.token, {
        operation: "close-poll",
        postId: f.post.id,
        expectedVersion: 1
      })
    ).status,
    200
  );
  assert.equal(
    (await send(f.lee.token, { ...vote, pollVersion: 2, expectedVersion: 2 }))
      .status,
    409
  );
});
test("public event participation shows aggregate results and gates member actions without exposing a roster", async () => {
  const f = await seedParticipation(db);
  await f.poll();
  const slot = await f.slot();
  await postCommand(db, f.ada.token, {
    operation: "edit",
    postId: f.post.id,
    expectedVersion: 1,
    audience: "PUBLIC",
    confirmAudienceChange: true
  });
  await calendarCommand(db, f.ada.token, {
    operation: "set-visibility",
    eventId: f.event.id,
    expectedVersion: 1,
    visibility: "PUBLIC",
    confirmed: true
  });
  const publicView = await (
    await get("/api/platform/participation?postId=" + f.post.id)
  ).json();
  assert.equal(publicView.eligible, false);
  assert.equal(publicView.poll.ballot, null);
  assert.equal(publicView.slots[0].signup, null);
  assert.equal(publicView.canOrganize, false);
  const html = await (await get("/platform/posts/" + f.post.id)).text();
  assert.ok(html.includes("Join or sign in to participate"));
  assert.ok(html.includes("Which preparation would be helpful?"));
  assert.ok(!html.includes("Show authorized roster"));
  assert.ok(!html.includes(f.ada.email));
  const vote = {
    operation: "vote",
    postId: f.post.id,
    pollVersion: 1,
    expectedVersion: 0,
    optionIds: [publicView.poll.options[0].id]
  };
  assert.equal((await send("", vote)).status, 401);
  assert.equal((await send(f.blake.token, vote)).status, 403);
  assert.equal((await send(f.unverified.token, vote)).status, 403);
  assert.equal(
    (await get("/api/platform/participation?view=roster&slotId=" + slot.id))
      .status,
    403
  );
});
