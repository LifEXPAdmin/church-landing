import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { registerAccount, loginAccount } from "../lib/platform/accounts";
import { ADULT_POLICY } from "../lib/platform/portal-types";
const db = new PrismaClient();
const origin = process.env.ACCOUNT_ORIGIN!;
const production = process.env.STRUCTURE_RENDER_PHASE === "production";
assert.equal(process.env.ACCOUNT_TEST_ISOLATED, "1");
assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
assert.equal(
  new URL(process.env.DATABASE_URL!).pathname,
  "/godschurches_security_test"
);
assert.match(origin, /^https?:\/\/127\.0\.0\.1:\d+$/);
async function actor(label: string) {
  const username = label + "_" + randomUUID().slice(0, 8);
  const password = "Fictional-structure-http-password-1";
  await db.platformAuthLimit.deleteMany();
  await registerAccount(db, {
    username,
    name: username + " Private Identity",
    email: username + "@example.test",
    password,
    confirmPassword: password,
    role: "BELIEVER"
  });
  // Deliberately eligible isolated renderer fixtures. Service and browser fixture
  // journeys separately verify actual registration and the local delivery sink.
  const user = await db.platformUser.update({
    where: { username },
    data: {
      emailVerifiedAt: new Date(),
      adultAcknowledgedAt: new Date(),
      adultPolicyVersion: ADULT_POLICY
    }
  });
  return { user, token: await loginAccount(db, user.email, password, null) };
}
let ada: Awaited<ReturnType<typeof actor>>,
  lee: typeof ada,
  val: typeof ada,
  morgan: typeof ada,
  pat: typeof ada,
  blake: typeof ada;
let churchId: string, otherChurchId: string;
const connections: Record<string, string> = {};
before(async () => {
  ada = await actor("ada");
  lee = await actor("lee");
  val = await actor("val");
  morgan = await actor("morgan");
  pat = await actor("pat");
  blake = await actor("blake");
  churchId = (
    await db.church.create({
      data: {
        name: "Fictional HTTP Structure " + randomUUID(),
        slug: "structure-" + randomUUID(),
        summary: "Public fictional church description"
      }
    })
  ).id;
  otherChurchId = (
    await db.church.create({
      data: {
        name: "Other HTTP Church " + randomUUID(),
        slug: "structure-other-" + randomUUID(),
        summary: "Other public fictional church description"
      }
    })
  ).id;
  for (const a of [ada, lee, val, morgan, pat, blake]) {
    const c = await db.churchConnection.create({
      data: {
        userId: a.user.id,
        churchId: a === blake ? otherChurchId : churchId,
        state: a === pat ? "PENDING" : "APPROVED"
      }
    });
    connections[a.user.id] = c.id;
    if (a !== pat)
      await db.churchDirectoryPreference.create({
        data: {
          connectionId: c.id,
          listed: a !== morgan,
          displayName:
            a === morgan
              ? "Hidden Morgan Canary"
              : a.user.username + " Shared Name",
          contactEmail: a.user.username + ".shared@example.test",
          phone: "+1 202 555 0149",
          emailAudience: a === morgan ? "ONLY_ME" : "SAME_CHURCH",
          phoneAudience: "ONLY_ME"
        }
      });
  }
  for (const capability of [
    "MANAGE_CHURCH_ACCESS",
    "MANAGE_STRUCTURE",
    "REVIEW_CONNECTIONS"
  ] as const)
    await db.churchCapabilityGrant.create({
      data: {
        userId: ada.user.id,
        churchId,
        capability,
        dependencyConnectionId: connections[ada.user.id]
      }
    });
});
// Each scenario has its own isolated request allowance; production limits stay unchanged.
beforeEach(() => db.platformAuthLimit.deleteMany());
after(() => db.$disconnect());
const get = (path: string, token = "", rsc = false) =>
  fetch(origin + path, {
    headers: {
      ...(token ? { Cookie: "church_platform_session=" + token } : {}),
      ...(rsc ? { RSC: "1" } : {})
    }
  });
const post = (
  input: unknown,
  token = ada.token,
  route = "church-structure",
  extra = {}
) =>
  fetch(origin + "/api/platform/" + route, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: "church_platform_session=" + token,
      ...extra
    },
    body: JSON.stringify(input)
  });
const read = async (token = ada.token, extra = "") => {
  const r = await get(
    `/api/platform/church-structure?churchId=${churchId}${extra}`,
    token
  );
  assert.equal(r.status, 200);
  return r.json();
};
const cmd = async (
  input: Record<string, unknown>,
  token = ada.token,
  status = 200
) => {
  const r = await post(
    { churchId, expectedVersion: (await read()).version, ...input },
    token
  );
  assert.equal(r.status, status, await r.clone().text());
  assert.match(r.headers.get("Cache-Control")!, /private, no-store/);
  return r.json();
};

test("assignment review entry protects member identity, preserves title revisions and resolves existing assignments within the selected position", async () => {
  for (const [token, canAssign] of [
    [ada.token, true],
    [lee.token, false]
  ] as const) {
    const directory = await get(
      `/api/platform/portal?view=directory&churchId=${churchId}`,
      token
    );
    assert.equal(directory.status, 200);
    assert.equal((await directory.json()).directoryCanAssignRoles, canAssign);
    for (const rsc of [false, true]) {
      const page = await (
        await get(`/platform/churches/${churchId}/directory`, token, rsc)
      ).text();
      if (production && rsc) {
        // A client component's Flight payload carries its permitted props;
        // its static button labels are verified in rendered HTML and the browser.
        assert.ok(page.includes(`"canAssign":${canAssign}`));
      } else
        assert.equal(
          page.includes("Assign role and review privileges"),
          production && canAssign
        );
      if (!production)
        assert.ok(page.includes("Open the private portal preview"));
      assert.equal(page.includes(morgan.user.email), false);
      assert.equal(page.includes("Hidden Morgan Canary"), false);
    }
  }
  const title = await cmd({
    operation: "template-create",
    requestKey: randomUUID(),
    name: "Private Privileges Review Title",
    presetKey: "P"
  });
  const p = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: title.id,
    roleTemplateVersion: 1
  });
  await cmd({
    operation: "template-edit",
    templateId: title.id,
    templateVersion: 1,
    name: "Future recommendations only",
    presetKey: "G"
  });
  const path = `/platform/churches/${churchId}/structure/assign?positionId=${p.id}`;
  for (const rsc of [false, true]) {
    const visible = await (await get(path, ada.token, rsc)).text();
    if (production) {
      assert.ok(visible.includes("Private Privileges Review Title"));
      if (!rsc) assert.ok(visible.includes("Continue to Privileges"));
    } else
      assert.ok(visible.includes("Open the private church structure preview"));
    for (const marker of [
      ada.user.email,
      morgan.user.email,
      "Hidden Morgan Canary",
      connections[morgan.user.id]
    ])
      assert.equal(visible.includes(marker), false, marker);
    for (const token of ["", lee.token, pat.token, blake.token]) {
      const denied = await (await get(path, token, rsc)).text();
      assert.equal(denied.includes("Private Privileges Review Title"), false);
    }
  }
  const endpoint = `/api/platform/church-structure?churchId=${churchId}&view=privileges&positionId=${p.id}`;
  assert.equal(
    (
      await post({
        operation: "assign",
        churchId,
        expectedVersion: (await read()).version,
        positionId: p.id,
        connectionId: connections[morgan.user.id]
      })
    ).status,
    400,
    "An older form cannot bypass the mandatory review"
  );
  const preview = await (
    await get(
      `${endpoint}&connectionId=${connections[morgan.user.id]}`,
      ada.token
    )
  ).json();
  assert.equal(preview.privileges.memberLabel, "Member is unlisted");
  assert.equal(preview.privileges.presetKey, "P");
  assert.ok(
    preview.privileges.recommendations.includes("PUBLISH_CHURCH_POSTS")
  );
  assert.equal(
    await db.churchPositionAssignment.count({ where: { positionId: p.id } }),
    0,
    "Reading privileges never assigns a member"
  );
  assert.equal(
    preview.positions.find((position: { id: string }) => position.id === p.id)
      .placement,
    "UNCONNECTED"
  );
  const saved = await cmd({
    operation: "assignment-privileges",
    positionId: p.id,
    connectionId: connections[morgan.user.id],
    capabilities: ["MANAGE_STRUCTURE"],
    privilegesReviewed: true,
    confirmed: true,
    requestKey: randomUUID(),
    assignmentVersion: 0
  });
  const reopenedResponse = await get(
    `${endpoint}&assignmentId=${saved.id}`,
    ada.token
  );
  assert.equal(reopenedResponse.status, 200);
  const reopenedText = await reopenedResponse.text();
  assert.equal(reopenedText.includes("Hidden Morgan Canary"), false);
  assert.equal(reopenedText.includes(morgan.user.email), false);
  const reopened = JSON.parse(reopenedText).privileges;
  assert.equal(reopened.assignmentId, saved.id);
  assert.deepEqual(reopened.selected, ["MANAGE_STRUCTURE"]);
  assert.ok(
    reopened.effective.some(
      (g: { assignmentId: string; positionName: string }) =>
        g.assignmentId === saved.id &&
        g.positionName === "Private Privileges Review Title"
    )
  );
  assert.equal(
    (
      await get(
        `${endpoint}&assignmentId=${saved.id}&connectionId=${connections[morgan.user.id]}`,
        ada.token
      )
    ).status,
    400
  );
  const other = await cmd({
    operation: "create",
    name: "Different position",
    requestKey: randomUUID()
  });
  assert.equal(
    (
      await get(
        `${endpoint.replace(p.id, other.id)}&assignmentId=${saved.id}`,
        ada.token
      )
    ).status,
    404
  );
  for (const token of [lee.token, pat.token, blake.token])
    assert.equal(
      (await get(`${endpoint}&assignmentId=${saved.id}`, token)).status,
      403
    );
  await cmd({
    operation: "unassign",
    positionId: p.id,
    id: saved.id,
    confirmed: true
  });
  await cmd({ operation: "archive", positionId: p.id, confirmed: true });
  await cmd({ operation: "archive", positionId: other.id, confirmed: true });
  await cmd({
    operation: "template-archive",
    templateId: title.id,
    templateVersion: 2,
    confirmed: true
  });
});

test("assignment privilege HTTP boundary requires current scope, explicit review and isolated source readback", async () => {
  const p = await cmd({
    operation: "create",
    name: "HTTP privileges position",
    requestKey: randomUUID()
  });
  const reviewPath = `/api/platform/church-structure?churchId=${churchId}&view=privileges&positionId=${p.id}&connectionId=${connections[morgan.user.id]}`;
  const review = await get(reviewPath, ada.token);
  assert.equal(review.status, 200);
  assert.match(review.headers.get("Cache-Control")!, /private, no-store/);
  const reviewText = await review.text();
  assert.equal(reviewText.includes("Hidden Morgan Canary"), false);
  assert.equal(reviewText.includes(morgan.user.email), false);
  const preview = JSON.parse(reviewText).privileges;
  assert.deepEqual(preview.selected, []);
  assert.equal(preview.assigned, false);
  for (const [token, status] of [
    ["", 401],
    [lee.token, 403],
    [pat.token, 403],
    [blake.token, 403]
  ] as const)
    assert.equal((await get(reviewPath, token)).status, status);
  const input = {
    operation: "assignment-privileges",
    churchId,
    positionId: p.id,
    connectionId: connections[morgan.user.id],
    capabilities: ["MANAGE_STRUCTURE"],
    privilegesReviewed: true,
    confirmed: true,
    requestKey: randomUUID(),
    assignmentVersion: 0,
    expectedVersion: (await read()).version
  };
  assert.equal(
    (await post({ ...input, privilegesReviewed: false })).status,
    400
  );
  assert.equal(
    (
      await post(input, ada.token, "church-structure", {
        Origin: "https://elsewhere.example"
      })
    ).status,
    403
  );
  assert.equal((await post(input, lee.token)).status, 403);
  const result = await post(input);
  assert.equal(result.status, 200, await result.clone().text());
  const saved = await result.json();
  assert.equal((await post(input)).status, 200);
  assert.equal(
    await db.churchRoleGrant.count({
      where: { assignmentId: saved.id, revokedAt: null }
    }),
    1
  );
  const current = (await (await get(reviewPath, ada.token)).json()).privileges;
  assert.deepEqual(current.selected, ["MANAGE_STRUCTURE"]);
  assert.ok(
    current.effective.some(
      (g: { source: string; assignmentId: string }) =>
        g.source === "ASSIGNMENT" && g.assignmentId === saved.id
    )
  );
  await cmd(
    { operation: "edit", positionId: p.id, name: "Role-supplied editor works" },
    morgan.token
  );
  const stale = {
    ...input,
    requestKey: randomUUID(),
    assignmentVersion: saved.version,
    expectedVersion: (await read()).version
  };
  await cmd({
    operation: "unassign",
    positionId: p.id,
    id: saved.id,
    confirmed: true
  });
  assert.equal(
    (
      await post(
        {
          operation: "edit",
          churchId,
          positionId: p.id,
          name: "Revoked role editor",
          expectedVersion: stale.expectedVersion
        },
        morgan.token
      )
    ).status,
    403
  );
  assert.equal((await post(input)).status, 409);
});

test("actual chart HTTP saves reviewed placement/layout atomically and protects retries and current scope", async () => {
  const a = await cmd({
    operation: "create",
    name: "Chart HTTP root",
    requestKey: randomUUID()
  });
  const b = await cmd({
    operation: "create",
    name: "Chart HTTP child",
    requestKey: randomUUID()
  });
  const input = {
    operation: "chart-save",
    churchId,
    expectedVersion: (await read()).version,
    requestKey: randomUUID(),
    confirmed: true,
    changes: [
      { id: a.id, placement: "ROOT", parentId: null, layout: null },
      {
        id: b.id,
        placement: "REPORTING",
        parentId: a.id,
        layout: { x: 40, y: 600 }
      }
    ]
  };
  for (const [token, status] of [
    ["", 401],
    [lee.token, 403],
    [pat.token, 403],
    [blake.token, 403]
  ] as const)
    assert.equal((await post(input, token)).status, status);
  assert.equal(
    (
      await post(input, ada.token, "church-structure", {
        Origin: "https://other.example"
      })
    ).status,
    403
  );
  assert.equal((await post({ ...input, confirmed: false })).status, 400);
  assert.equal(
    (await post({ ...input, capabilities: ["MANAGE_STRUCTURE"] })).status,
    400
  );
  const response = await post(input);
  assert.equal(response.status, 200, await response.clone().text());
  const result = await response.json();
  assert.deepEqual(await (await post(input)).json(), result);
  const saved = (await read()).positions.find(
    (p: { id: string }) => p.id === b.id
  );
  assert.equal(saved.parentId, a.id);
  assert.deepEqual(saved.layout, { x: 40, y: 600 });
  assert.equal(
    await db.churchChartSave.count({
      where: { churchId, requestKey: input.requestKey }
    }),
    1
  );
  assert.equal(
    (await post({ ...input, requestKey: randomUUID() })).status,
    409
  );
  assert.equal(
    (
      await post({
        ...input,
        changes: [
          { ...input.changes[0], parentId: b.id, placement: "REPORTING" }
        ],
        requestKey: randomUUID(),
        expectedVersion: result.version
      })
    ).status,
    400
  );
  assert.equal((await read()).version, result.version);
  await cmd({ operation: "archive", positionId: b.id, confirmed: true });
  await cmd({ operation: "archive", positionId: a.id, confirmed: true });
});

test("actual structure HTTP routes preserve private positions/contact projections and enforce current grants", async () => {
  const leadership = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "Private Leadership Position",
    description: "Private ministry responsibilities canary"
  });
  const outreach = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "Outreach"
  });
  await cmd({
    operation: "place",
    positionId: leadership.id,
    placement: "ROOT"
  });
  await cmd({
    operation: "place",
    positionId: outreach.id,
    placement: "REPORTING",
    parentId: leadership.id
  });
  const coordinator = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "Volunteer Coordinator"
  });
  await cmd({
    operation: "place",
    positionId: coordinator.id,
    placement: "REPORTING",
    parentId: outreach.id
  });
  const worship = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "Worship"
  });
  for (const [position, a] of [
    [outreach, lee],
    [coordinator, val],
    [leadership, morgan],
    [leadership, lee]
  ] as const)
    await cmd({
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: position.id,
      connectionId: connections[a.user.id]
    });
  const snapshot = await read();
  assert.equal(
    snapshot.positions.find((p: { id: string }) => p.id === worship.id)
      .assignments.length,
    0
  );
  assert.equal(
    snapshot.positions.find((p: { id: string }) => p.id === leadership.id)
      .assignments.length,
    2
  );
  const hidden = [
    "Hidden Morgan Canary",
    morgan.user.name,
    morgan.user.email,
    connections[morgan.user.id],
    val.user.email,
    "+1 202 555 0149",
    ada.token,
    lee.token,
    val.token
  ];
  for (const secret of hidden)
    assert.equal(JSON.stringify(snapshot).includes(secret), false, secret);
  const card = await read(
    ada.token,
    `&view=person&connectionId=${connections[val.user.id]}`
  );
  assert.equal(card.person.email, val.user.username + ".shared@example.test");
  assert.equal(card.person.phone, undefined);
  for (const token of [pat.token, blake.token])
    assert.equal(
      (await get(`/api/platform/church-structure?churchId=${churchId}`, token))
        .status,
      403
    );
  assert.equal(
    (await get(`/api/platform/church-structure?churchId=${churchId}`)).status,
    401
  );
  assert.equal(
    (
      await get(
        `/api/platform/church-structure?churchId=${churchId}&view=person&connectionId=${connections[morgan.user.id]}`,
        ada.token
      )
    ).status,
    404
  );
  for (const suffix of [
    "overview",
    "structure",
    "structure?mode=outline",
    `structure/${leadership.id}`,
    "responsibilities",
    "access",
    `people/${connections[val.user.id]}`
  ]) {
    for (const rsc of [false, true]) {
      const response = await get(
        `/platform/churches/${churchId}/${suffix}`,
        ada.token,
        rsc
      );
      assert.equal(response.status, 200);
      const html = await response.text();
      for (const secret of hidden)
        assert.equal(
          html.includes(secret),
          false,
          `Private value appeared in ${suffix}`
        );
      assert.equal(html.includes("Hidden Morgan Canary"), false);
      if (production) {
        if (suffix === "structure" && !rsc) {
          assert.ok(html.includes("Connected church positions"));
          assert.ok(html.includes("Find a role or listed person"));
          assert.ok(html.includes('data-chart-card="' + leadership.id + '"'));
          assert.ok(html.includes('data-chart-card="' + outreach.id + '"'));
          assert.ok(html.includes("2 assigned"));
          assert.ok(html.includes("Assigned · member is unlisted"));
          assert.ok(html.includes("Fill this position"));
          assert.ok(html.includes("Review privileges"));
          assert.ok(
            html.includes("structure/assign?positionId=" + outreach.id)
          );
        }
        if (suffix.startsWith("people/"))
          assert.ok(html.includes(val.user.username + ".shared@example.test"));
        if (suffix.startsWith("structure"))
          assert.ok(html.includes("Private Leadership Position"));
      } else {
        assert.ok(html.includes("Open the private church structure preview"));
        assert.equal(
          html.includes("Private ministry responsibilities canary"),
          false
        );
      }
    }
  }
  for (const token of ["", pat.token, blake.token])
    for (const rsc of [false, true]) {
      const html = await (
        await get(`/platform/churches/${churchId}/structure`, token, rsc)
      ).text();
      assert.equal(html.includes("Private Leadership Position"), false);
      assert.equal(
        html.includes("Private ministry responsibilities canary"),
        false
      );
      for (const secret of hidden) assert.equal(html.includes(secret), false);
    }
  assert.equal(
    (
      await (
        await get(`/api/platform/portal?view=public&churchId=${churchId}`)
      ).text()
    ).includes("Private Leadership Position"),
    false
  );
  await cmd(
    {
      operation: "assign",
      privilegesReviewed: true,
      confirmed: true,
      positionId: outreach.id,
      connectionId: connections[blake.user.id]
    },
    ada.token,
    404
  );
  await cmd(
    {
      operation: "place",
      placement: "REPORTING",
      positionId: leadership.id,
      parentId: coordinator.id
    },
    ada.token,
    400
  );
  const grant = await cmd({
    operation: "grant",
    listedConnection: connections[lee.user.id],
    capability: "MANAGE_STRUCTURE"
  });
  await cmd(
    {
      operation: "edit",
      positionId: outreach.id,
      parentId: leadership.id,
      name: "Outreach ministry"
    },
    lee.token
  );
  const stale = await read(lee.token);
  const access = await read(ada.token, "&view=access");
  const g = access.grants.find((g: { id: string }) => g.id === grant.id);
  await cmd({
    operation: "revoke",
    id: grant.id,
    grantVersion: g.version,
    confirmed: true
  });
  assert.equal(
    (
      await post(
        {
          operation: "edit",
          churchId,
          positionId: outreach.id,
          name: "Stale edit",
          expectedVersion: stale.version
        },
        lee.token
      )
    ).status,
    403
  );
  assert.equal(
    (await read(lee.token)).capabilities.includes("MANAGE_STRUCTURE"),
    false
  );
  if (production) {
    const html = await (
      await get(
        `/platform/churches/${churchId}/structure/${outreach.id}`,
        lee.token
      )
    ).text();
    const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
    assert.equal(visible.includes("Save position"), false);
    const chart = await (
      await get(`/platform/churches/${churchId}/structure`, lee.token)
    ).text();
    assert.ok(chart.includes("Connected church positions"));
    assert.equal(chart.includes("Fill this position"), false);
    assert.equal(chart.includes("Review privileges"), false);
    assert.equal(chart.includes("Add another person"), false);
    assert.equal(chart.includes("Edit structure"), false);
    assert.equal(chart.includes("Review changes"), false);
    for (const secret of hidden) assert.equal(chart.includes(secret), false);
  }
  const c = await db.churchConnection.findUniqueOrThrow({
    where: { id: connections[val.user.id] }
  });
  assert.equal(
    (
      await post(
        {
          operation: "transition",
          action: "REMOVE",
          churchId,
          connectionId: c.id,
          expectedVersion: c.version
        },
        ada.token,
        "portal"
      )
    ).status,
    200
  );
  assert.equal(
    (
      await get(
        `/api/platform/church-structure?churchId=${churchId}`,
        val.token
      )
    ).status,
    403
  );
  assert.equal(
    await db.churchPositionAssignment.count({
      where: { connectionId: c.id, revokedAt: null }
    }),
    0
  );
});

test("actual structure HTTP handles forged requests and preserves guest destination without exposing metadata", async () => {
  const input = {
    operation: "create",
    churchId,
    expectedVersion: (await read()).version,
    requestKey: randomUUID(),
    name: "Never created"
  };
  assert.equal((await post(input, "")).status, 401);
  assert.equal(
    (
      await post(input, ada.token, "church-structure", {
        Origin: "https://invalid.example.test"
      })
    ).status,
    403
  );
  assert.equal(
    (
      await post(input, ada.token, "church-structure", {
        "Sec-Fetch-Site": "cross-site"
      })
    ).status,
    403
  );
  assert.equal(
    (await post({ ...input, description: "x".repeat(3001) })).status,
    400
  );
  assert.equal(
    await db.churchPosition.count({
      where: { churchId, name: "Never created" }
    }),
    0
  );
  for (const suffix of [
    "overview",
    "structure/new",
    "access",
    "responsibilities",
    "people/missing"
  ]) {
    const html = await (
      await get(`/platform/churches/${churchId}/${suffix}`)
    ).text();
    assert.ok(html.includes("Church space | Godschurches"));
    if (production) {
      assert.ok(
        html.includes(
          "Join or sign in to view your church responsibilities and structure."
        )
      );
      assert.ok(
        html.includes(
          encodeURIComponent(`/platform/churches/${churchId}/${suffix}`)
        )
      );
    }
    assert.equal(html.includes(ada.user.name), false);
    assert.equal(html.includes(morgan.user.name), false);
  }
});

test("actual role library HTTP preserves revisions and separates templates from grants and position instances", async () => {
  const template = await cmd({
    operation: "template-create",
    requestKey: randomUUID(),
    name: "HTTP Role Library Canary",
    description: "Only approved structure managers see this library.",
    responsibilities: "Prepare rehearsals",
    presetKey: "G"
  });
  const library = await read(ada.token, "&view=roles");
  assert.equal(library.roleTemplates[0].id, template.id);
  assert.deepEqual(library.roleTemplates[0].recommendations, []);
  for (const token of [lee.token, pat.token, blake.token]) {
    assert.equal(
      (
        await get(
          `/api/platform/church-structure?churchId=${churchId}&view=roles`,
          token
        )
      ).status,
      403
    );
    await cmd(
      {
        operation: "template-edit",
        templateId: template.id,
        templateVersion: 1,
        name: "Forbidden"
      },
      token,
      403
    );
  }
  const path = `/platform/churches/${churchId}/structure/roles`;
  for (const rsc of [false, true]) {
    const visible = await (await get(path, ada.token, rsc)).text();
    if (production) {
      assert.ok(visible.includes("HTTP Role Library Canary"));
      if (!rsc) {
        assert.ok(visible.includes("Starter library"));
        assert.ok(visible.includes("Create a custom title"));
      }
    } else
      assert.ok(visible.includes("Open the private church structure preview"));
    for (const marker of [
      ada.user.email,
      morgan.user.email,
      "Hidden Morgan Canary",
      connections[morgan.user.id]
    ])
      assert.equal(visible.includes(marker), false, marker);
    for (const token of ["", lee.token, blake.token, pat.token]) {
      const deniedHtml = await (await get(path, token, rsc)).text();
      assert.equal(deniedHtml.includes("HTTP Role Library Canary"), false);
      assert.equal(
        deniedHtml.includes(
          "Only approved structure managers see this library."
        ),
        false
      );
      if (production && !token)
        assert.ok(deniedHtml.includes(encodeURIComponent(path)));
    }
  }
  const first = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: template.id,
    roleTemplateVersion: 1
  });
  const second = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    roleTemplateId: template.id,
    roleTemplateVersion: 1
  });
  await cmd({
    operation: "place",
    positionId: second.id,
    placement: "REPORTING",
    parentId: first.id
  });
  assert.notEqual(first.id, second.id);
  const grants = await db.churchCapabilityGrant.findMany({
    where: { churchId },
    orderBy: { id: "asc" }
  });
  await cmd({
    operation: "template-edit",
    templateId: template.id,
    templateVersion: 1,
    name: "HTTP Updated Role",
    presetKey: "C",
    recommendations: ["EDIT_CHURCH_CALENDAR"]
  });
  await cmd(
    {
      operation: "template-edit",
      templateId: template.id,
      templateVersion: 1,
      name: "Stale title"
    },
    ada.token,
    409
  );
  const persisted = await db.churchPosition.findUniqueOrThrow({
    where: { id: second.id }
  });
  assert.equal(persisted.name, "HTTP Role Library Canary");
  assert.equal(persisted.roleTemplateVersion, 1);
  assert.equal(persisted.parentId, first.id);
  await cmd({
    operation: "template-archive",
    templateId: template.id,
    templateVersion: 2,
    confirmed: true
  });
  await cmd(
    {
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: template.id,
      roleTemplateVersion: 2
    },
    ada.token,
    404
  );
  assert.equal((await read(ada.token, "&view=roles")).roleTemplates.length, 0);
  assert.deepEqual(
    await db.churchCapabilityGrant.findMany({
      where: { churchId },
      orderBy: { id: "asc" }
    }),
    grants
  );
});

test("contact cards expose chosen fields and relevant roles, preserve entry context, and remove withdrawn or inaccessible data", async () => {
  const member = await actor("contact_member");
  const connection = await db.churchConnection.create({
    data: { userId: member.user.id, churchId, state: "APPROVED" }
  });
  const name = "Chosen contact canary " + randomUUID();
  const email = "chosen-" + randomUUID() + "@example.test";
  const phone = "+1 202 555 0198";
  await db.churchDirectoryPreference.create({
    data: {
      connectionId: connection.id,
      listed: true,
      displayName: name,
      contactEmail: email,
      phone,
      emailAudience: "SAME_CHURCH",
      phoneAudience: "ONLY_ME"
    }
  });
  const title = await cmd({
    operation: "template-create",
    requestKey: randomUUID(),
    name: "Contact role " + randomUUID(),
    presetKey: "P"
  });
  const positions = [];
  for (const description of [
    "First contact responsibilities",
    "Second contact responsibilities"
  ]) {
    const position = await cmd({
      operation: "create",
      requestKey: randomUUID(),
      roleTemplateId: title.id,
      roleTemplateVersion: 1,
      description
    });
    await cmd({
      operation: "assign",
      positionId: position.id,
      connectionId: connection.id,
      privilegesReviewed: true,
      confirmed: true
    });
    positions.push(position.id);
  }
  const api = `/api/platform/church-structure?churchId=${churchId}&view=person&connectionId=${connection.id}`;
  const page = `/platform/churches/${churchId}/people/${connection.id}`;
  const card = await (await get(api, ada.token)).json();
  assert.deepEqual(card.person, { connectionId: connection.id, name, email });
  assert.deepEqual(
    card.positions
      .filter((p: { assignments: { connectionId?: string }[] }) =>
        p.assignments.some((a) => a.connectionId === connection.id)
      )
      .map((p: { id: string }) => p.id)
      .sort(),
    positions.sort()
  );
  for (const rsc of [false, true]) {
    const html = await (
      await get(`${page}?from=chart&focus=${positions[0]}`, ada.token, rsc)
    ).text();
    for (const secret of [
      member.user.email,
      member.user.name,
      phone,
      member.token
    ])
      assert.equal(html.includes(secret), false);
    if (production) {
      for (const shown of [
        name,
        email,
        "First contact responsibilities",
        "Second contact responsibilities"
      ])
        assert.ok(html.includes(shown), shown);
      if (!rsc) {
        const rendered = html.replace(/<!--.*?-->/g, "");
        assert.ok(rendered.includes("Back to church chart"));
        assert.ok(rendered.includes("No phone number shared."));
        assert.ok(rendered.includes(`structure?focus=${positions[0]}`));
        assert.ok(rendered.includes("Review privileges for Contact role"));
      } else {
        assert.ok(html.includes('"canManage":true'));
        assert.ok(html.includes(`"focus":"${positions[0]}"`));
      }
      const directory = await (
        await get(
          `/platform/churches/${churchId}/directory?focus=${connection.id}`,
          ada.token,
          rsc
        )
      ).text();
      if (!rsc)
        assert.ok(directory.includes(`people/${connection.id}?from=directory`));
      else assert.ok(directory.includes(`"connectionId":"${connection.id}"`));
      const responsibilities = await (
        await get(
          `/platform/churches/${churchId}/responsibilities`,
          member.token,
          rsc
        )
      ).text();
      assert.ok(
        responsibilities.includes(
          `people/${connection.id}?from=responsibilities`
        )
      );
      const chart = await (
        await get(`/platform/churches/${churchId}/structure`, ada.token, rsc)
      ).text();
      if (!rsc) assert.ok(chart.includes(`people/${connection.id}?from=chart`));
      else assert.ok(chart.includes(`"connectionId":"${connection.id}"`));
      const outline = await (
        await get(
          `/platform/churches/${churchId}/structure?mode=outline`,
          ada.token,
          rsc
        )
      ).text();
      assert.ok(outline.includes(`people/${connection.id}?from=outline`));
    }
  }
  await db.churchDirectoryPreference.update({
    where: { connectionId: connection.id },
    data: { emailAudience: "ONLY_ME", phoneAudience: "SAME_CHURCH" }
  });
  assert.deepEqual((await (await get(api, ada.token)).json()).person, {
    connectionId: connection.id,
    name,
    phone
  });
  for (const rsc of [false, true]) {
    const html = await (await get(page, ada.token, rsc)).text();
    assert.equal(html.includes(email), false);
    assert.equal(html.includes(member.user.email), false);
    if (production) {
      assert.ok(html.includes(phone));
      if (!rsc) assert.ok(html.includes("No contact email shared."));
    }
  }
  await db.churchDirectoryPreference.update({
    where: { connectionId: connection.id },
    data: { listed: false }
  });
  assert.equal((await get(api, ada.token)).status, 404);
  const paths = [
    page,
    `/platform/churches/${churchId}/directory`,
    `/platform/churches/${churchId}/structure`,
    `/platform/churches/${churchId}/structure?mode=outline`,
    `/api/platform/portal?view=directory&churchId=${churchId}`,
    `/api/platform/church-structure?view=structure&churchId=${churchId}`,
    `/api/platform/church-structure?view=assign&churchId=${churchId}&q=${encodeURIComponent(name)}`
  ];
  for (const path of paths)
    for (const rsc of [false, true]) {
      const text = await (await get(path, ada.token, rsc)).text();
      // A requested contact ID can occur in Next's route state; it must not be
      // discovered through directory, chart or search responses after unlisting.
      for (const secret of [
        name,
        email,
        phone,
        member.user.email,
        ...(path === page ? [] : [connection.id])
      ])
        assert.equal(
          text.includes(secret),
          false,
          `Withdrawn contact in ${path}`
        );
    }
  await db.churchDirectoryPreference.update({
    where: { connectionId: connection.id },
    data: { listed: true }
  });
  const grant = await cmd({
    operation: "grant",
    listedConnection: connection.id,
    capability: "MANAGE_STRUCTURE"
  });
  assert.equal(
    (await (await get(api, member.token)).json()).capabilities.includes(
      "MANAGE_STRUCTURE"
    ),
    true
  );
  const currentGrant = await db.churchCapabilityGrant.findUniqueOrThrow({
    where: { id: grant.id }
  });
  await cmd({
    operation: "revoke",
    id: grant.id,
    grantVersion: currentGrant.version,
    confirmed: true
  });
  assert.equal(
    (await (await get(api, member.token)).json()).capabilities.includes(
      "MANAGE_STRUCTURE"
    ),
    false
  );
  if (production) {
    const html = await (await get(page, member.token)).text();
    assert.equal(html.includes("Review privileges for Contact role"), false);
    assert.equal(html.includes("Assign role and review privileges"), false);
  }
  const currentConnection = await db.churchConnection.findUniqueOrThrow({
    where: { id: connection.id }
  });
  const removed = await post(
    {
      operation: "transition",
      action: "REMOVE",
      churchId,
      connectionId: connection.id,
      expectedVersion: currentConnection.version
    },
    ada.token,
    "portal"
  );
  assert.equal(removed.status, 200, await removed.text());
  assert.equal((await get(api, member.token)).status, 403);
  assert.equal((await get(api, ada.token)).status, 404);
  for (const rsc of [false, true]) {
    const html = await (await get(page, ada.token, rsc)).text();
    for (const secret of [name, email, phone, member.user.email])
      assert.equal(html.includes(secret), false);
  }
});

test("saved chart history HTML, Flight and JSON require current church authority and conceal unlisted editors", async () => {
  const position = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "History position " + randomUUID()
  });
  await db.churchCapabilityGrant.create({
    data: {
      churchId,
      userId: morgan.user.id,
      dependencyConnectionId: connections[morgan.user.id],
      capability: "MANAGE_STRUCTURE"
    }
  });
  await cmd(
    {
      operation: "chart-save",
      requestKey: randomUUID(),
      confirmed: true,
      changes: [
        {
          id: position.id,
          parentId: null,
          placement: "ROOT",
          layout: { x: 20, y: 40 }
        }
      ]
    },
    morgan.token
  );
  const api = `/api/platform/church-structure?churchId=${churchId}&view=history`;
  const response = await get(api, ada.token);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control")!, /private, no-store/);
  const history = (await response.json()).chartHistory;
  assert.equal(history.entries[0].actor, "Unlisted or former member");
  assert.deepEqual(history.entries[0].changes[0].after.layout, {
    x: 20,
    y: 40
  });
  assert.equal(history.entries[0].changes[0].positionId, position.id);
  const forbidden = [
    morgan.user.name,
    morgan.user.email,
    "Hidden Morgan Canary",
    connections[morgan.user.id],
    morgan.token,
    "inputHash",
    "requestKey",
    "actorId"
  ];
  for (const secret of forbidden)
    assert.equal(JSON.stringify(history).includes(secret), false);
  for (const rsc of [false, true]) {
    const html = await (
      await get(
        `/platform/churches/${churchId}/structure/history`,
        ada.token,
        rsc
      )
    ).text();
    for (const secret of forbidden)
      assert.equal(html.includes(secret), false, secret);
    if (production) assert.ok(html.includes("Unlisted or former member"));
    else assert.ok(html.includes("Open the private church structure preview"));
  }
  for (const token of [pat.token, blake.token])
    assert.equal((await get(api, token)).status, 403);
  assert.equal((await get(api)).status, 401);
  assert.equal((await get(api + "&cursor=bad", ada.token)).status, 400);
  await db.churchCapabilityGrant.updateMany({
    where: { churchId, userId: morgan.user.id, capability: "MANAGE_STRUCTURE" },
    data: { revokedAt: new Date() }
  });
  assert.equal((await get(api, morgan.token)).status, 403);
  const denied = await (
    await get(`/platform/churches/${churchId}/structure/history`, morgan.token)
  ).text();
  assert.equal(denied.includes("History position"), false);
});
