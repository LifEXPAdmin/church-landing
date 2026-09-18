import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import {
  readMenuShortcuts,
  saveMenuShortcuts
} from "../lib/platform/menu-shortcuts";
import { handleMenuShortcutsRequest } from "../lib/platform/menu-shortcuts-boundary";
import { loginAccount } from "../lib/platform/accounts";
import { accountConfig } from "../lib/platform/account-config";
import { PortalError } from "../lib/platform/portal-policy";
import {
  prepareAccountExport,
  downloadAccountExport
} from "../lib/platform/account-export";
import { requestPermanentAccountDeletion } from "../lib/platform/account-deletion";
import { eraseRequestedAccountData } from "../lib/platform/account-erasure";
import { createSessionToken } from "../lib/platform/auth";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());
const choice = (ids: string[], expectedVersion = 0) => ({
  ids,
  expectedVersion,
  mutationId: randomUUID()
});
const denied = (run: () => unknown, status: number) =>
  assert.rejects(
    async () => run(),
    (e: unknown) => e instanceof PortalError && e.status === status
  );

test("shortcuts retain bounded ordered account choices across sessions and reset only their own preference", async () => {
  const a = await createPortalActor(db, "shortcuts", {
      verified: false,
      adult: false
    }),
    b = await createPortalActor(db, "othercuts");
  const initial = await readMenuShortcuts(db, a.token);
  assert.deepEqual(initial.ids, []);
  assert.equal(initial.version, 0);
  assert.equal(initial.limit, 6);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: a.id } }),
    0
  );
  await db.socialPreferences.create({
    data: {
      ownerId: a.id,
      feedMode: "friends",
      feedVersion: 4,
      mentions: "NOBODY",
      version: 7
    }
  });
  const ids = ["settings", "exchange", "groups", "calendars", "profile", "qr"];
  const command = choice(ids);
  await saveMenuShortcuts(db, a.token, command);
  const token = await loginAccount(
    db,
    a.email,
    a.password,
    "Second shortcut device"
  );
  const page = await readMenuShortcuts(db, token);
  assert.deepEqual(page.ids, ids);
  assert.equal(
    page.choices.find((item) => item.id === "profile")?.href,
    `/platform/profile/${a.username}`
  );
  assert.equal(
    page.choices.find((item) => item.id === "qr")?.href,
    "/platform/invitations"
  );
  assert.deepEqual((await readMenuShortcuts(db, b.token)).ids, []);
  await saveMenuShortcuts(db, token, choice([], page.version));
  assert.deepEqual((await readMenuShortcuts(db, a.token)).ids, []);
  const row = await db.socialPreferences.findUniqueOrThrow({
    where: { ownerId: a.id }
  });
  assert.equal(row.menuShortcutsVersion, 2);
  assert.equal(row.feedMode, "friends");
  assert.equal(row.feedVersion, 4);
  assert.equal(row.mentions, "NOBODY");
  assert.equal(row.version, 7);
});

test("lost replies keep exact receipts and concurrent versioned edits have one winner", async () => {
  const a = await createPortalActor(db, "cutretry");
  const original = choice(["groups", "exchange"]);
  const receipt = await saveMenuShortcuts(db, a.token, original);
  assert.deepEqual(await saveMenuShortcuts(db, a.token, original), receipt);
  await denied(
    () => saveMenuShortcuts(db, a.token, { ...original, ids: ["settings"] }),
    409
  );
  const results = await Promise.allSettled([
    saveMenuShortcuts(db, a.token, choice(["settings"], 1)),
    saveMenuShortcuts(db, a.token, choice(["calendars"], 1))
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await readMenuShortcuts(db, a.token)).version, 2);
  assert.deepEqual(await saveMenuShortcuts(db, a.token, original), receipt);
  assert.equal((await readMenuShortcuts(db, a.token)).version, 2);
  assert.equal(
    await db.socialOperation.count({
      where: { ownerId: a.id, key: { startsWith: "menu-shortcuts:" } }
    }),
    2
  );
});

test("forbidden or unavailable destinations cannot be saved or replayed into access; restored IDs are reprojected", async () => {
  const a = await createPortalActor(db, "cutgrant");
  for (const ids of [
    ["admin"],
    ["mediaCatalogItem"],
    ["https://untrusted.invalid"],
    ["__proto__"]
  ])
    await denied(() => saveMenuShortcuts(db, a.token, choice(ids)), 403);
  for (const ids of [
    ["settings", "settings"],
    Array.from({ length: 7 }, (_, i) => String(i))
  ])
    await denied(() => saveMenuShortcuts(db, a.token, choice(ids)), 400);
  await denied(
    () => saveMenuShortcuts(db, a.token, { ...choice([]), ownerId: "foreign" }),
    400
  );
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: a.id } }),
    0
  );
  const grant = await db.platformOperatorGrant.create({
    data: { userId: a.id, capability: "VIEW_PLATFORM_METRICS" }
  });
  assert.ok(
    (await readMenuShortcuts(db, a.token)).choices.some(
      (item) => item.id === "admin"
    )
  );
  const command = choice(["admin", "settings"]);
  await saveMenuShortcuts(db, a.token, command);
  await db.platformOperatorGrant.update({
    where: { id: grant.id },
    data: { revokedAt: new Date() }
  });
  let page = await readMenuShortcuts(db, a.token);
  assert.deepEqual(page.ids, ["settings"]);
  assert.ok(!page.choices.some((item) => item.id === "admin"));
  assert.ok(!JSON.stringify(page).includes("/platform/admin"));
  await denied(() => saveMenuShortcuts(db, a.token, command), 403);
  await db.socialPreferences.update({
    where: { ownerId: a.id },
    data: { menuShortcutIds: ["admin", "mediaCatalogItem", "settings"] }
  });
  page = await readMenuShortcuts(db, a.token);
  assert.deepEqual(page.ids, ["settings"]);
  assert.ok(!JSON.stringify(page).includes("mediaCatalogItem"));
  await saveMenuShortcuts(db, a.token, choice([], page.version));
  assert.deepEqual(
    (await db.socialPreferences.findUniqueOrThrow({ where: { ownerId: a.id } }))
      .menuShortcutIds,
    []
  );
});

test("shortcut HTTP enforces account, session, origin and body bounds with private no-store projections", async () => {
  const a = await createPortalActor(db, "cuthttp"),
    b = await createPortalActor(db, "cutforeign");
  const origin = accountConfig().origin;
  const request = (
    body?: unknown,
    headers: Record<string, string> = {},
    token = a.token,
    query = ""
  ) =>
    new Request(origin + "/api/platform/menu-shortcuts" + query, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: `church_platform_session=${token}`,
        Origin: origin,
        "Content-Type": "application/json",
        "X-Expected-Account": a.id,
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
  for (const [req, code] of [
    [
      request(choice(["settings"]), { Origin: "https://untrusted.invalid" }),
      403
    ],
    [request(undefined, {}, b.token), 401],
    [request(undefined, { "X-Expected-Account": "" }), 400],
    [request(undefined, {}, a.token, "?owner=other"), 400],
    [request({ ...choice([]), padding: "x".repeat(20000) }), 400]
  ] as const) {
    const result = await handleMenuShortcutsRequest(db, req);
    assert.equal(result.status, code);
    assert.match(result.headers.get("cache-control") ?? "", /no-store/);
  }
  const saved = await handleMenuShortcutsRequest(
    db,
    request(choice(["settings"]))
  );
  assert.equal(saved.status, 200);
  const response = await handleMenuShortcutsRequest(db, request());
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  const text = await response.text();
  for (const value of [a.email, a.token, a.password, b.id, b.username])
    assert.ok(!text.includes(value));
  await db.platformUser.update({
    where: { id: a.id },
    data: { deactivatedAt: new Date() }
  });
  assert.equal((await handleMenuShortcutsRequest(db, request())).status, 401);
  await assert.rejects(readMenuShortcuts(db, a.token));
});

test("own export includes shortcut order and permanent erasure removes it without affecting another owner", async () => {
  const a = await createPortalActor(db, "cutexport"),
    b = await createPortalActor(db, "cutkeep");
  await saveMenuShortcuts(db, a.token, choice(["settings", "groups"]));
  await saveMenuShortcuts(db, b.token, choice(["calendars"]));
  const secret = process.env.AUTH_RATE_LIMIT_SECRET!;
  const proof = await prepareAccountExport(db, a.token, a.password, secret);
  const result = JSON.parse(
    await downloadAccountExport(db, a.token, proof.authorization, secret)
  );
  assert.deepEqual(result.socialPreferences[0].menuShortcutIds, [
    "settings",
    "groups"
  ]);
  const journal = { async recordAccount() {}, async completeAccount() {} };
  await requestPermanentAccountDeletion(
    db,
    a.token,
    a.password,
    true,
    createSessionToken(),
    journal
  );
  const deletion = await db.accountDeletion.findUniqueOrThrow({
    where: { userId: a.id }
  });
  await eraseRequestedAccountData(db, deletion.id, journal);
  assert.equal(
    await db.socialPreferences.count({ where: { ownerId: a.id } }),
    0
  );
  assert.deepEqual((await readMenuShortcuts(db, b.token)).ids, ["calendars"]);
});
