import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { clientHarness, nodes } from "./fixtures/client-hook-harness.mjs";
const secret = "Fictional unrelated private contribution note";
const contribution = {
  id: "private-contribution-a",
  slotId: "slot-a",
  state: "COMMITTED",
  note: secret,
  quoteMinor: 24680,
  disputeNote: "Fictional private dispute"
};
const slot = {
  id: "slot-a",
  version: 3,
  action: "DONATE",
  label: "Food parcels",
  unit: "items",
  target: 10,
  committed: 2,
  received: 1,
  returned: 0,
  status: "Open",
  closed: false,
  loan: false,
  volunteer: null
};
const need = {
  id: "need-a",
  version: 2,
  consentVersion: 1,
  canContribute: true,
  closed: false,
  canceled: false,
  open: true,
  coordinatorCurrent: true,
  timeZone: "UTC",
  deadlineLocal: "2026-10-20T12:00",
  slots: [slot],
  contributions: [contribution],
  names: [],
  updates: []
};
const detail = {
  listingId: "need-a",
  listingVersion: 5,
  title: "Fictional need",
  listingState: "ACTIVE",
  canCoordinate: true,
  canManage: true,
  need
};
async function serverForms() {
  const h = clientHarness({ URLSearchParams });
  const pageModule = h.load("components/platform/exchange-needs-page.tsx", {
    "next/link": { default: "a" },
    "./platform-shell": { PlatformShell: "shell" },
    "./private-snapshot-guard": { PrivateSnapshotGuard: "guard" },
    "./topic-read-boundary": { TopicReadBoundary: "public-guard" },
    "./exchange-page-ui": {
      ExchangeAccountLinks: "account",
      ExchangeNavigation: "nav",
      ExchangeUnavailable: "unavailable",
      exchangeChecksum: (v) =>
        createHash("sha256").update(JSON.stringify(v)).digest("hex")
    },
    "./exchange-need-forms": {
      NeedClaimForm: "claim",
      NeedSetupForm: "setup",
      NeedSlotForm: "slot"
    },
    "./exchange-need-actions": {
      NeedOrganizerActions: "organizer",
      NeedPostLinks: "posts",
      NeedContributionCard: "contribution"
    },
    "./exchange-need-contributions": {
      ExchangeNeedContributions: "contributions"
    },
    "./exchange-need-volunteers": { ExchangeNeedVolunteers: "volunteers" },
    "./exchange-need-roles": { ExchangeNeedRoles: "current-roles" },
    "./exchange-need-progress": {
      ExchangeNeedProgressProvider: "progress-owner",
      NeedSlotProgress: "progress"
    },
    "./regional-presentation": { RegionalTime: "time" },
    "@/lib/platform/session": {
      getCurrentPlatformUser: async () => ({ id: "owner-a" })
    },
    "@/lib/platform/exchange-session": {
      exchangeNeedPage: async (query) =>
        query.view === "roles"
          ? {
              ownerId: "owner-a",
              roles: [
                {
                  id: "private-role-a",
                  role: "Fictional private role",
                  capacity: 3,
                  eventTitle: "Fictional private event",
                  postId: "private-event-post",
                  startAt: "2026-10-05T12:00:00Z",
                  approvalRequired: false
                }
              ],
              next: "private-role-cursor"
            }
          : query.view === "posts"
            ? {
                ownerId: "owner-a",
                posts: [
                  {
                    id: "private-post-a",
                    version: 4,
                    excerpt: "Fictional private post excerpt",
                    linked: true
                  }
                ],
                next: "private-post-cursor"
              }
            : detail
    },
    "@/lib/platform/exchange-need-form-context": h.load(
      "lib/platform/exchange-need-form-context.ts"
    ),
    "@/lib/platform/exchange-need-options": h.load(
      "lib/platform/exchange-need-options.ts"
    ),
    "@/lib/platform/portal-policy": { PortalError: class extends Error {} },
    "@/lib/platform/post-input": { postId: (id) => id }
  });
  const result = await pageModule.ExchangeNeedsPage({
    listingId: "need-a",
    query: {}
  });
  assert.equal(nodes(result, (n) => n.type === "unavailable").length, 0);
  return result;
}
test("initial Need slot output omits event role identifiers, titles, capacity and response cursor", async () => {
  const tree = await serverForms(),
    serialized = JSON.stringify(tree);
  for (const value of [
    "private-role-a",
    "Fictional private role",
    "Fictional private event",
    "private-event-post",
    "private-role-cursor"
  ])
    assert.ok(!serialized.includes(value), "Initial output contains " + value);
  const roles = nodes(tree, (n) => n.type === "current-roles");
  assert.equal(roles.length, 1);
  assert.equal(roles[0].props.owner, "owner-a");
  assert.match(roles[0].props.url, /view=need-roles/);
  assert.equal(typeof roles[0].props.checksum, "string");
  assert.equal(nodes(tree, (n) => n.type === "slot").length, 2);
  for (const form of nodes(tree, (n) => n.type === "slot"))
    assert.equal(form.props.roles, undefined);
});

const role = {
  id: "role-a",
  role: "Fictional role",
  eventTitle: "Fictional event",
  capacity: 4,
  postId: "post-a",
  startAt: "2026-10-05T12:00:00Z",
  approvalRequired: false
};
function rolesHarness(t) {
  const h = clientHarness(),
    state = { visible: true };
  const rolesModule = h.load("components/platform/exchange-need-roles.tsx", {
    "next/link": { default: "a" },
    "./private-snapshot-guard": { PrivateSnapshotGuard: "guard" },
    "./read-visibility": { useReadVisibility: () => state.visible }
  });
  const children = {
    type: "original-slot",
    props: { children: "Fictional retained draft" }
  };
  const props = {
    owner: "owner-a",
    url: "/api/platform/exchange?view=need-roles&listingId=need-a",
    checksum: "server-checksum",
    path: "/needs/a",
    children
  };
  const wrapper = rolesModule.ExchangeNeedRoles(props);
  h.mount(() => wrapper.type(props));
  t.after(() => h.unmount());
  return {
    h,
    state,
    children,
    rolesModule,
    props,
    deliver(data) {
      h.output.props.onVerified(data);
      h.render();
    },
    contents() {
      const child = h.output.props.children;
      return child.type(child.props);
    }
  };
}
test("role choices initialize empty and reuse the existing guard without a second reader", (t) => {
  const s = rolesHarness(t);
  assert.equal(s.h.output.type, "guard");
  assert.equal(s.h.output.props.checksum, "server-checksum");
  assert.deepEqual(Array.from(s.contents().props.value), []);
  assert.equal(nodes(s.contents(), (n) => n.type === "a").length, 0);
  s.deliver({ ownerId: "owner-a", roles: [role], next: "next/a" });
  assert.deepEqual(Array.from(s.contents().props.value), [role]);
  const link = nodes(s.contents(), (n) => n.type === "a")[0];
  assert.equal(link.props.href, "/needs/a?rolesAfter=next%2Fa");
  assert.equal(
    nodes(s.contents(), (n) => n.type === "original-slot")[0],
    s.children
  );
  s.state.visible = false;
  assert.equal(nodes(s.contents(), (n) => n.type === "a").length, 0);
  assert.equal(
    nodes(s.contents(), (n) => n.type === "original-slot")[0],
    s.children
  );
});
for (const [name, data] of [
  ["wrong owner", { ownerId: "other", roles: [role], next: null }],
  ["missing roles", { ownerId: "owner-a", next: null }],
  ["duplicate roles", { ownerId: "owner-a", roles: [role, role], next: null }],
  [
    "invalid capacity",
    { ownerId: "owner-a", roles: [{ ...role, capacity: 0 }], next: null }
  ],
  [
    "invalid date",
    { ownerId: "owner-a", roles: [{ ...role, startAt: "invalid" }], next: null }
  ],
  ["invalid cursor", { ownerId: "owner-a", roles: [role], next: 3 }],
  [
    "oversized page",
    {
      ownerId: "owner-a",
      roles: Array.from({ length: 21 }, (_, i) => ({ ...role, id: String(i) })),
      next: null
    }
  ]
])
  test(
    "role consumer rejects " + name + " before replacing the retained page",
    (t) => {
      const s = rolesHarness(t);
      s.deliver({ ownerId: "owner-a", roles: [role], next: null });
      assert.throws(() => s.deliver(data), /could not be confirmed/);
      assert.deepEqual(Array.from(s.contents().props.value), [role]);
    }
  );

test("role owner resets on account or URL replacement but not a confirmed checksum", (t) => {
  const s = rolesHarness(t),
    view = s.rolesModule.ExchangeNeedRoles,
    key = view(s.props).key;
  assert.notEqual(view({ ...s.props, owner: "owner-b" }).key, key);
  assert.notEqual(
    view({ ...s.props, url: s.props.url + "&after=role-b" }).key,
    key
  );
  assert.equal(
    view({ ...s.props, checksum: "confirmed-next-snapshot" }).key,
    key
  );
});
