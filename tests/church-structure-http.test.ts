import test, { before, after } from "node:test";
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
    name: "Outreach",
    parentId: leadership.id
  });
  const coordinator = await cmd({
    operation: "create",
    requestKey: randomUUID(),
    name: "Volunteer Coordinator",
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
    [leadership, morgan]
  ] as const)
    await cmd({
      operation: "assign",
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
    1
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
      positionId: outreach.id,
      connectionId: connections[blake.user.id]
    },
    ada.token,
    404
  );
  await cmd(
    {
      operation: "edit",
      positionId: leadership.id,
      parentId: coordinator.id,
      name: "Cycle"
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
    roleTemplateVersion: 1,
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
