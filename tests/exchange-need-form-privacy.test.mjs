import assert from "node:assert/strict";
import test from "node:test";
import {
  clientHarness,
  input,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";
const owner = "fictional-owner";
const need = {
  id: "need-a",
  version: 2,
  consentVersion: 1,
  timeZone: "UTC",
  contributions: [],
  canContribute: true,
  closed: false,
  canceled: false
};
const slot = {
  id: "slot-a",
  version: 1,
  action: "DONATE",
  label: "Fictional private slot",
  unit: "items",
  target: 10,
  committed: 0,
  closed: false
};
const row = {
  id: "row-a",
  version: 1,
  state: "COMMITTED",
  quantity: 3,
  received: 1,
  returned: 0,
  current: true,
  own: true,
  title: "Fictional saved title",
  note: "Fictional saved note",
  quoteMinor: null,
  quoteCurrency: null,
  shareName: false,
  disputed: false,
  disputeNote: "",
  loanResponsibility: "",
  loanReturnAt: null,
  contributor: null,
  createdAt: "2026-10-01T12:00:00Z",
  listingId: "need-a"
};
function setup(t) {
  const h = clientHarness();
  const state = { visible: true, calls: 0 };
  const action = {
    blocked: false,
    status: "Fictional private server response",
    command: async () => {},
    rearm: () => false
  };
  const options = h.load("lib/platform/exchange-need-options.ts");
  const common = {
    "next/link": { default: "a" },
    "./read-visibility": { useReadVisibility: () => state.visible },
    "./exchange-saved-controls": {
      useExchangeAction: () => {
        state.calls++;
        return action;
      }
    },
    "./portal-action-form": { portalInputClass: "" },
    "@/lib/platform/exchange-need-options": options
  };
  const forms = h.load("components/platform/exchange-need-forms.tsx", {
    ...common,
    "@/lib/platform/exchange-options": h.load(
      "lib/platform/exchange-options.ts"
    )
  });
  const actions = h.load("components/platform/exchange-need-actions.tsx", {
    ...common,
    "./use-private-choice-action": {
      usePrivateChoiceAction: () => {
        state.calls++;
        return action;
      }
    },
    "@/lib/platform/community-report-types": {
      reportEntryHref: () => "/report"
    },
    "./regional-presentation": { RegionalTime: "time" }
  });
  t.after(() => h.unmount());
  return { h, state, forms, actions };
}
for (const entry of [
  {
    name: "NeedSetupForm",
    props: {
      owner,
      detail: {
        listingId: "need-a",
        listingVersion: 1,
        need,
        canCoordinate: true
      }
    },
    field: "Time zone, for example America/Chicago"
  },
  {
    name: "NeedSlotForm",
    props: { owner, need, slot, roles: [] },
    field: "Item or help description"
  },
  {
    name: "NeedClaimForm",
    props: { owner, need, slot },
    field: "Optional private note to the coordinator"
  },
  {
    name: "NeedClaimForm",
    label: "private quote",
    props: { owner, need, slot: { ...slot, action: "SELL" } },
    field: "Exact scope of this quote"
  },
  {
    name: "NeedOrganizerActions",
    props: { owner, need },
    field: "Public organizer update"
  },
  {
    name: "NeedContributionCard",
    props: { owner, row },
    field: "Private dispute note"
  },
  {
    name: "NeedVolunteerReceipt",
    props: {
      owner,
      needId: "need-a",
      signup: {
        id: "signup-a",
        version: 1,
        name: "Fictional private name",
        state: "ACTIVE",
        completedAt: "2026-10-01T12:00:00Z"
      }
    },
    field: "Reason for correcting completed help"
  }
])
  test(`${entry.name} ${entry.label ?? ""} conceals unsent fields without unmounting its command owner`, (t) => {
    const { h, state, forms, actions } = setup(t);
    const Component = forms[entry.name] ?? actions[entry.name];
    h.mount(() => Component(entry.props));
    input(h.output, entry.field).props.onChange({
      target: { value: "Fictional unsent secret" }
    });
    h.render();
    const calls = state.calls;
    state.visible = false;
    h.render();
    assert.ok(
      state.calls > calls,
      "Retain original action hook during concealment"
    );
    assert.equal(
      nodes(h.output, (n) =>
        ["textarea", "input", "button", "a", "form"].includes(n.type)
      ).length,
      0
    );
    assert.equal(textContent(h.output), "");
    state.visible = true;
    h.render();
    assert.equal(
      input(h.output, entry.field).props.value,
      "Fictional unsent secret"
    );
  });
for (const entry of [
  {
    name: "NeedPostLinks",
    props: {
      owner,
      need,
      posts: [
        {
          id: "post-a",
          version: 1,
          excerpt: "Fictional private post excerpt",
          linked: false
        }
      ]
    }
  },
  {
    name: "NeedClaimForm",
    props: {
      owner,
      need,
      slot: {
        ...slot,
        action: "VOLUNTEER",
        volunteer: {
          id: "role-a",
          postId: "post-a",
          open: true,
          signup: {
            id: "signup-a",
            version: 1,
            state: "ACTIVE",
            completedAt: null
          }
        }
      }
    }
  },
  {
    name: "NeedClaimForm",
    props: {
      owner,
      need: {
        ...need,
        contributions: [{ id: "own-a", slotId: "slot-a", state: "QUOTED" }]
      },
      slot
    }
  }
])
  test(`${entry.name} saved private status and links leave concealed output`, (t) => {
    const { h, state, forms, actions } = setup(t);
    h.mount(() => (forms[entry.name] ?? actions[entry.name])(entry.props));
    assert.notEqual(textContent(h.output), "");
    state.visible = false;
    h.render();
    assert.equal(textContent(h.output), "");
    assert.equal(nodes(h.output, (n) => n.type === "a").length, 0);
  });
