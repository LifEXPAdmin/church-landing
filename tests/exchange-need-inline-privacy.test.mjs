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
  disputeNote: "Fictional private dispute",
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
  volunteer: null,
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
  updates: [],
};
const detail = {
  listingId: "need-a",
  listingVersion: 5,
  title: "Fictional need",
  listingState: "ACTIVE",
  canCoordinate: true,
  canManage: true,
  need,
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
        createHash("sha256").update(JSON.stringify(v)).digest("hex"),
    },
    "./exchange-need-forms": {
      NeedClaimForm: "claim",
      NeedSetupForm: "setup",
      NeedSlotForm: "slot",
    },
    "./exchange-need-actions": {
      NeedOrganizerActions: "organizer",
      NeedPostLinks: "posts",
      NeedContributionCard: "contribution",
    },
    "./exchange-need-contributions": {
      ExchangeNeedContributions: "contributions",
    },
    "./exchange-need-volunteers": { ExchangeNeedVolunteers: "volunteers" },
    "./exchange-need-roles": { ExchangeNeedRoles: "current-roles" },
    "./exchange-need-posts": { ExchangeNeedPosts: "current-posts" },
    "./exchange-need-progress": {
      ExchangeNeedProgressProvider: "progress-owner",
      NeedSlotProgress: "progress",
    },
    "./regional-presentation": { RegionalTime: "time" },
    "@/lib/platform/session": {
      getCurrentPlatformUser: async () => ({ id: "owner-a" }),
    },
    "@/lib/platform/exchange-session": {
      exchangeNeedPage: async (query) =>
        query.view === "roles"
          ? { roles: [], next: null }
          : query.view === "posts"
            ? {
                ownerId: "owner-a",
                posts: [
                  {
                    id: "private-post-a",
                    version: 4,
                    excerpt: "Fictional private post excerpt",
                    linked: true,
                  },
                ],
                next: "private-post-cursor",
              }
            : detail,
    },
    "@/lib/platform/exchange-need-form-context": h.load(
      "lib/platform/exchange-need-form-context.ts",
    ),
    "@/lib/platform/exchange-need-options": h.load(
      "lib/platform/exchange-need-options.ts",
    ),
    "@/lib/platform/portal-policy": { PortalError: class extends Error {} },
    "@/lib/platform/post-input": { postId: (id) => id },
  });
  const result = await pageModule.ExchangeNeedsPage({
    listingId: "need-a",
    query: {},
  });
  assert.equal(nodes(result, (n) => n.type === "unavailable").length, 0);
  return result;
}
test("Need post links omit private excerpts, identifiers, state and cursor from initial server output", async () => {
  const tree = await serverForms();
  assert.equal(nodes(tree, (n) => n.type === "posts").length, 0);
  const serialized = JSON.stringify(tree);
  for (const value of [
    "private-post-a",
    "Fictional private post excerpt",
    "private-post-cursor",
  ])
    assert.ok(!serialized.includes(value), `Initial output contains ${value}`);
  const current = nodes(tree, (n) => n.type === "current-posts");
  assert.equal(current.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(current[0].props)), {
    owner: "owner-a",
    listingId: "need-a",
    needId: "need-a",
    path: "/platform/exchange/need-a/needs",
  });
});

test("inline contribution rows and private fields are omitted from initial server output", async () => {
  const tree = await serverForms();
  const serialized = JSON.stringify(tree);
  for (const value of [
    secret,
    "private-contribution-a",
    "Fictional private dispute",
    "24680",
  ])
    assert.ok(!serialized.includes(value), `Initial output contains ${value}`);
  assert.equal(nodes(tree, (n) => n.type === "contribution").length, 0);
  const owners = nodes(tree, (n) => n.type === "contributions");
  assert.equal(owners.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(owners[0].props)), {
    owner: "owner-a",
    query: { view: "need", listingId: "need-a", needId: "need-a" },
  });
});
