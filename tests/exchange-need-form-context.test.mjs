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
            ? { posts: [], next: null }
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
for (const type of ["claim", "setup", "slot", "organizer", "current-posts"])
  test(`${type} server props exclude unrelated private contribution data`, async () => {
    const tree = await serverForms();
    const forms = nodes(tree, (n) => n.type === type);
    assert.ok(forms.length > 0);
    for (const form of forms) {
      const value = JSON.stringify(form.props);
      assert.ok(!value.includes(secret), `${type} duplicates private notes`);
      assert.ok(
        !value.includes("private-contribution-a"),
        `${type} duplicates private identifiers`,
      );
    }
  });

function formHarness() {
  const h = clientHarness({ confirm: () => true });
  const commands = [];
  const action = {
    blocked: false,
    status: null,
    rearm: () => false,
    command: async (value) => {
      commands.push(value);
      return true;
    },
  };
  const context = h.load("lib/platform/exchange-need-form-context.ts");
  const common = {
    "next/link": { default: "a" },
    "./read-visibility": { useReadVisibility: () => true },
    "./exchange-saved-controls": { useExchangeAction: () => action },
    "./portal-action-form": { portalInputClass: "" },
    "@/lib/platform/exchange-need-options": h.load(
      "lib/platform/exchange-need-options.ts",
    ),
  };
  const forms = h.load("components/platform/exchange-need-forms.tsx", {
    "./exchange-need-roles": { useNeedRoleChoices: () => [] },
    ...common,
    "@/lib/platform/exchange-options": h.load(
      "lib/platform/exchange-options.ts",
    ),
  });
  const actions = h.load("components/platform/exchange-need-actions.tsx", {
    ...common,
    "./use-private-choice-action": { usePrivateChoiceAction: () => action },
    "@/lib/platform/community-report-types": {
      reportEntryHref: () => "/report",
    },
    "./regional-presentation": { RegionalTime: "time" },
  });
  return { h, commands, context, forms, actions };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("claim context keeps only the matching active offer state, without changing the source", () => {
  const { context } = formHarness();
  for (const state of [
    "COMMITTED",
    "WAITLISTED",
    "QUOTED",
    "DECLINED",
    "CANCELED",
    "REVOKED",
  ]) {
    const value = {
      ...need,
      contributions: [
        { ...contribution, state, slotId: "other" },
        { ...contribution, state },
      ],
    };
    const before = JSON.stringify(value);
    const result = context.needClaimContext(value, slot);
    assert.deepEqual(
      plain(result.need.contributions),
      ["COMMITTED", "WAITLISTED", "QUOTED"].includes(state)
        ? [{ slotId: "slot-a", state }]
        : [],
    );
    assert.equal(JSON.stringify(value), before);
    assert.deepEqual(Object.keys(result.need).sort(), [
      "canContribute",
      "consentVersion",
      "contributions",
      "id",
    ]);
  }
});

test("slot and signup projections discard nested identifiers and unrelated fields", () => {
  const { context } = formHarness();
  const volunteer = {
    id: "role-a",
    postId: "post-a",
    opportunityId: "opportunity-a",
    approvalRequired: true,
    open: false,
    role: secret,
    event: { title: secret },
    signup: {
      id: "private-signup-a",
      version: 7,
      state: "CANCELED",
      completedAt: null,
      extra: secret,
    },
  };
  const value = { ...slot, volunteer, extra: secret };
  const claim = context.needClaimContext(need, value),
    editor = context.needSlotContext(need, value);
  assert.deepEqual(plain(claim.slot.volunteer), {
    postId: "post-a",
    opportunityId: "opportunity-a",
    approvalRequired: true,
    open: false,
    signup: { version: 7, state: "CANCELED", completedAt: null },
  });
  assert.deepEqual(plain(editor.slot.volunteer), { id: "role-a" });
  assert.ok(!JSON.stringify([claim, editor]).includes(secret));
  assert.ok(!JSON.stringify([claim, editor]).includes("private-signup-a"));
  assert.equal(
    context.needSetupContext({ ...detail, need: null }).detail.need,
    null,
  );
  assert.equal(context.needSlotContext(need).slot, undefined);
});

for (const [name, build] of Object.entries({
  setup: (c) => [
    "NeedSetupForm",
    { detail },
    c.needSetupContext(detail),
    (tree) =>
      nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
        preventDefault() {},
      }),
  ],
  slot: (c) => [
    "NeedSlotForm",
    { need, slot, roles: [] },
    { ...c.needSlotContext(need, slot), roles: [] },
    (tree) =>
      nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
        preventDefault() {},
      }),
  ],
  claim: (c) => {
    const fresh = { ...need, contributions: [] };
    return [
      "NeedClaimForm",
      { need: fresh, slot },
      c.needClaimContext(fresh, slot),
      (tree) =>
        nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
          preventDefault() {},
        }),
    ];
  },
  volunteer: (c) => {
    const role = {
      ...slot,
      action: "VOLUNTEER",
      volunteer: {
        id: "role-a",
        postId: "post-a",
        opportunityId: null,
        open: true,
        approvalRequired: false,
        signup: {
          id: "private-signup",
          version: 4,
          state: "CANCELED",
          completedAt: null,
        },
      },
    };
    const fresh = { ...need, contributions: [] };
    return [
      "NeedClaimForm",
      { need: fresh, slot: role },
      c.needClaimContext(fresh, role),
      (tree) => nodes(tree, (n) => n.type === "button")[0].props.onClick(),
    ];
  },
  organizer: (c) => [
    "NeedOrganizerActions",
    { need },
    c.needOrganizerContext(need),
    (tree) =>
      nodes(tree, (n) => n.type === "form")[0].props.onSubmit({
        preventDefault() {},
      }),
  ],
  closeSlot: (c) => [
    "NeedOrganizerActions",
    { need, slot },
    c.needOrganizerContext(need, slot),
    (tree) => nodes(tree, (n) => n.type === "button")[0].props.onClick(),
  ],
  post: (c) => {
    const posts = [
      { id: "post-a", version: 8, excerpt: "Fictional post", linked: false },
    ];
    return [
      "NeedPostLinks",
      { need, posts },
      { ...c.needPostContext(need), posts },
      (tree) => nodes(tree, (n) => n.type === "button")[0].props.onClick(),
    ];
  },
}))
  test(`${name} narrowed props preserve displayed controls and exact command fields`, () => {
    const first = formHarness(),
      second = formHarness();
    const [name, full, narrow, act] = build(first.context);
    first.h.mount(() =>
      (first.forms[name] ?? first.actions[name])({ owner: "owner-a", ...full }),
    );
    second.h.mount(() =>
      (second.forms[name] ?? second.actions[name])({
        owner: "owner-a",
        ...narrow,
      }),
    );
    assert.deepEqual(plain(second.h.output), plain(first.h.output));
    act(first.h.output);
    act(second.h.output);
    assert.equal(first.commands.length, 1);
    assert.equal(second.commands.length, 1);
    const a = plain(first.commands[0]),
      b = plain(second.commands[0]);
    if (name === "NeedClaimForm" && a.operation === "need-claim") {
      assert.ok(a.id && b.id);
      delete a.id;
      delete b.id;
    }
    assert.deepEqual(b, a);
    first.h.unmount();
    second.h.unmount();
  });

test("canonical form guard checksum remains unchanged while private rows use a current reader", async () => {
  const tree = await serverForms();
  assert.ok(
    nodes(tree, (n) => n.type === "guard").some(
      (n) =>
        n.props.checksum ===
        createHash("sha256").update(JSON.stringify(detail)).digest("hex"),
    ),
  );
  assert.equal(nodes(tree, (n) => n.type === "contribution").length, 0);
  assert.equal(nodes(tree, (n) => n.type === "contributions").length, 1);
});
