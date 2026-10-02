import assert from "node:assert/strict";
import test from "node:test";
import {
  clientHarness,
  button,
  input,
  nodes,
  textContent
} from "./fixtures/client-hook-harness.mjs";

const root = "components/platform/";
const noop = () => null;
const permissions = {
  steward: true,
  profile: true,
  drafts: true,
  publish: true
};
const artist = {
  id: "artist",
  version: 4,
  state: "PUBLISHED",
  name: "Saved name",
  biography: "Saved bio",
  presentation: "PERSON",
  roles: [],
  genres: [],
  countryId: null,
  townId: null,
  churchCredit: "",
  credits: []
};
const release = {
  id: "release",
  artistId: "artist",
  version: 7,
  state: "PUBLISHED",
  title: "Saved release",
  kind: "ALBUM",
  description: "Saved description",
  releaseDate: null,
  credits: [],
  links: [],
  tracks: [
    { id: "track", title: "Saved track", durationSeconds: 10, links: [] }
  ]
};
function setup() {
  const calls = [],
    saved = [],
    guards = [];
  let handler = async () => ({
    data: { id: "artist", version: 5, message: "Saved" }
  });
  let owner = "owner",
    ticket = 1,
    available = true;
  let navigation = async () => {},
    ownerCheck = async () => owner;
  const access = {
    get visible() {
      return available;
    },
    current: () => (available ? ticket : null),
    resume: noop
  };
  const h = clientHarness({
    window: {
      setTimeout,
      clearTimeout,
      confirm: () => true,
      location: {
        origin: "https://example.test",
        assign: (url) => saved.push(url)
      }
    }
  });
  const { SocialClientError } = h.load("lib/platform/social-client.ts", {
    "./privileged-auth-navigation": { announcePrivilegedChallenge: () => false }
  });
  const types = h.load("lib/platform/artist-types.ts");
  const library = h.load(root + "artist-library.tsx", {
    "next/link": { default: noop },
    "next/navigation": { useRouter: noop, useSearchParams: noop },
    "./media-catalog-library": { useMediaRead: noop },
    "./use-photo-back-guard": { settlePhotoNavigation: () => navigation() },
    "@/lib/platform/social-client": {
      SocialClientError,
      currentSocialOwner: () => ownerCheck(),
      socialRequest: async (...args) => {
        calls.push(args);
        return handler(...args);
      }
    },
    "@/lib/platform/artist-types": types,
    "./discovery-place-picker": { DiscoveryPlacePicker: noop }
  });
  let data = {
    artist: { ...artist },
    permissions: { ...permissions },
    releases: [],
    delegates: [],
    associations: [],
    ownDelegate: null
  };
  const shared = {
    "next/link": { default: noop },
    "./artist-library": library,
    "./artist-editor-workspace": { useArtistContinuation: () => access },
    "./use-unsaved-social-work": {
      useUnsavedSocialWork: (state) => guards.push(state)
    },
    "./media-catalog-library": {
      useMediaRead: () => ({ data, error: "", reload: noop })
    },
    "@/lib/platform/artist-types": types
  };
  return {
    h,
    library,
    shared,
    calls,
    saved,
    guards,
    access,
    SocialClientError,
    set handler(fn) {
      handler = fn;
    },
    set owner(v) {
      owner = v;
    },
    set navigation(fn) {
      navigation = fn;
    },
    set ownerCheck(fn) {
      ownerCheck = fn;
    },
    set visible(v) {
      available = v;
      ticket++;
    },
    get data() {
      return data;
    },
    set data(v) {
      data = v;
    }
  };
}
const edit = (h, label, value) => {
  input(h.output, label).props.onChange({ target: { value } });
  h.render();
};
const submit = (h, index = 0) =>
  nodes(h.output, (n) => n.type === "form")[index].props.onSubmit({
    preventDefault() {}
  });

test("first definitive validation failure preserves editable draft and permits corrected request", async () => {
  const s = setup();
  s.handler = async () => {
    throw new s.SocialClientError(400, "Correct the title");
  };
  s.h.mount(() =>
    s.library.useArtistWrite("owner", "test", noop, undefined, s.access)
  );
  s.h.output.act({ operation: "save", fields: { name: "" } });
  await s.h.settle();
  assert.equal(s.h.output.uncertain, null);
  assert.equal(s.h.output.message, "Correct the title");
  s.h.output.act({ operation: "save", fields: { name: "Corrected" } });
  await s.h.settle();
  assert.equal(s.calls.length, 2);
  assert.equal(JSON.parse(s.calls[1][1]).fields.name, "Corrected");
  assert.notEqual(
    JSON.parse(s.calls[0][1]).mutationId,
    JSON.parse(s.calls[1][1]).mutationId
  );
});

test("lost-response recovery retains exact bytes after a later 400 and blocks edited replacement", async () => {
  const s = setup();
  s.handler = async () => {
    throw new Error("lost reply");
  };
  s.h.mount(() =>
    s.library.useArtistWrite("owner", "test", noop, undefined, s.access)
  );
  s.h.output.act({ operation: "save", fields: { name: "Original" } });
  await s.h.settle();
  const original = s.h.output.uncertain;
  s.handler = async () => {
    throw new s.SocialClientError(400, "Rejected retry");
  };
  button(s.h.output.controls, "Retry exact change").props.onClick();
  await s.h.settle();
  assert.equal(s.h.output.uncertain, original);
  s.h.output.act({ operation: "save", fields: { name: "Replacement" } });
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0][1], s.calls[1][1]);
});

test("accepted hidden response needs deliberate original-owner continuation without a second POST", async () => {
  const s = setup();
  let resolve;
  s.handler = () =>
    new Promise((done) => {
      resolve = done;
    });
  s.h.mount(() =>
    s.library.useArtistWrite(
      "owner",
      "test",
      (...args) => s.saved.push(args),
      undefined,
      s.access
    )
  );
  s.h.output.act({ operation: "create", fields: { name: "Private" } });
  s.visible = false;
  resolve({ data: { id: "artist", version: 1, message: "Saved" } });
  await s.h.settle();
  assert.equal(s.saved.length, 0);
  assert.ok(s.h.output.uncertain);
  s.visible = true;
  s.owner = "other";
  s.h.render();
  button(
    s.h.output.controls,
    "Continue after saved artist change"
  ).props.onClick();
  await s.h.settle();
  assert.equal(s.saved.length, 0);
  s.owner = "owner";
  button(
    s.h.output.controls,
    "Continue after saved artist change"
  ).props.onClick();
  await s.h.settle();
  assert.equal(s.saved.length, 1);
  assert.equal(s.calls.length, 1);
  assert.equal(s.h.output.uncertain, null);
});

for (const [label, operation] of [
  ["Unpublish artist", "unpublish"],
  ["Withdraw profile permission", "withdraw-rights"]
]) {
  test(`${operation} keeps unsent artist fields and place query through refreshed state`, async () => {
    const s = setup();
    function Place() {}
    const { ArtistEditor } = s.h.load(root + "artist-editor.tsx", {
      ...s.shared,
      "./artist-release-editor": { ArtistReleaseEditor: noop },
      "./artist-delegates": { ArtistDelegates: noop },
      "./discovery-place-picker": { DiscoveryPlacePicker: Place }
    });
    s.h.mount(() => ArtistEditor({ owner: "owner", id: "artist" }));
    edit(s.h, "Artist name", "Unsent artist name");
    const place = () => nodes(s.h.output, (n) => n.type === Place)[0];
    place().props.onQueryChange("Unsent town");
    s.h.render();
    button(s.h.output, label).props.onClick();
    await s.h.settle();
    assert.equal(JSON.parse(s.calls[0][1]).operation, operation);
    assert.equal(JSON.parse(s.calls[0][1]).fields, undefined);
    s.data = { ...s.data, artist: { ...artist, state: "DRAFT", version: 5 } };
    s.h.render();
    assert.equal(
      input(s.h.output, "Artist name").props.value,
      "Unsent artist name"
    );
    assert.equal(place().props.queryValue, "Unsent town");
    assert.equal(s.guards.at(-1).dirty, true);
    assert.equal(s.guards.at(-1).conflict, false);
    submit(s.h);
    await s.h.settle();
    const command = JSON.parse(s.calls[1][1]);
    assert.equal(command.expectedVersion, 5);
    assert.equal(command.fields.name, "Unsent artist name");
  });
}

for (const [label, operation] of [
  ["Unpublish release", "unpublish-release"],
  ["Withdraw release permission", "withdraw-release-rights"]
]) {
  test(`${operation} retains dirty release metadata and ordered tracks`, async () => {
    const s = setup();
    s.handler = async () => ({
      data: { id: "release", version: 8, message: "Saved" }
    });
    const { ArtistReleaseEditor } = s.h.load(
      root + "artist-release-editor.tsx",
      {
        ...s.shared,
        "./artist-editor": {
          ArtistCredits: noop,
          ArtistRights: noop,
          rightsInput: noop
        }
      }
    );
    let item = { ...release };
    s.h.mount(() =>
      ArtistReleaseEditor({
        owner: "owner",
        artistId: "artist",
        item,
        visible: true,
        canPublish: true,
        onSaved: noop,
        onClose: noop
      })
    );
    edit(s.h, "Release title", "Unsent release");
    button(s.h.output, "Add track").props.onClick();
    s.h.render();
    const before = nodes(s.h.output, (n) => n.type === "input").map(
      (n) => n.props.value
    );
    button(s.h.output, label).props.onClick();
    await s.h.settle();
    assert.equal(JSON.parse(s.calls[0][1]).operation, operation);
    assert.equal(JSON.parse(s.calls[0][1]).fields, undefined);
    item = { ...item, state: "DRAFT", version: 8 };
    s.h.render();
    assert.equal(
      input(s.h.output, "Release title").props.value,
      "Unsent release"
    );
    assert.deepEqual(
      nodes(s.h.output, (n) => n.type === "input").map((n) => n.props.value),
      before
    );
    assert.equal(s.guards.at(-1).dirty, true);
    assert.equal(s.guards.at(-1).conflict, false);
    submit(s.h);
    await s.h.settle();
    const command = JSON.parse(s.calls[1][1]);
    assert.equal(command.expectedVersion, 8);
    assert.equal(command.fields.title, "Unsent release");
    assert.equal(command.fields.tracks.length, 2);
  });
}

test("accepted invitation allows explicit current-permission review without discarding event sibling", async () => {
  const s = setup();
  const { ArtistDelegates } = s.h.load(root + "artist-delegates.tsx", s.shared);
  s.h.mount(() =>
    ArtistDelegates({
      owner: "owner",
      id: "artist",
      data: s.data,
      reload: noop,
      visible: true,
      disabled: false
    })
  );
  edit(
    s.h,
    "Event page link",
    "https://example.test/platform/events/event-one"
  );
  edit(s.h, "Member account reference", "invitee");
  nodes(
    s.h.output,
    (n) => n.type === "input" && n.props.type === "checkbox"
  )[0].props.onChange({ target: { checked: true } });
  s.h.render();
  submit(s.h);
  await s.h.settle();
  s.data = {
    ...s.data,
    delegates: [
      {
        id: "invitation",
        accountId: "invitee",
        capabilities: ["EDIT_ARTIST_PROFILE"],
        version: 1,
        state: "PENDING",
        expiresAt: "2026-12-01T00:00:00Z",
        revokedAt: null
      }
    ]
  };
  s.h.render();
  assert.ok(!textContent(s.h.output).includes("invitee"));
  button(
    s.h.output,
    "Review current permissions and keep entries"
  ).props.onClick();
  s.h.render();
  assert.equal(
    input(s.h.output, "Event page link").props.value,
    "https://example.test/platform/events/event-one"
  );
  assert.equal(input(s.h.output, "Member account reference").props.value, "");
  assert.equal(s.guards.at(-1).dirty, true);
  assert.equal(s.guards.at(-1).conflict, false);
  assert.equal(s.calls.length, 1, "Adopting a read must not send a mutation");
});

for (const status of [401, 403, 429, 503]) {
  test(`first ${status} keeps original request for deliberate recovery`, async () => {
    const s = setup();
    s.handler = async () => {
      throw new s.SocialClientError(status, "Retry later");
    };
    s.h.mount(() =>
      s.library.useArtistWrite("owner", "test", noop, undefined, s.access)
    );
    s.h.output.act({ operation: "save", fields: { name: "Original" } });
    await s.h.settle();
    assert.equal(s.h.output.uncertain, s.calls[0][1]);
    s.h.output.act({ operation: "save", fields: { name: "Replacement" } });
    assert.equal(s.calls.length, 1);
  });
}

test("status-only acceptance keeps dirty navigation protection during final identity check", async () => {
  const s = setup();
  const { ArtistEditor } = s.h.load(root + "artist-editor.tsx", {
    ...s.shared,
    "./artist-release-editor": { ArtistReleaseEditor: noop },
    "./artist-delegates": { ArtistDelegates: noop },
    "./discovery-place-picker": { DiscoveryPlacePicker: noop }
  });
  let finishIdentity;
  s.ownerCheck = () =>
    new Promise((done) => {
      finishIdentity = done;
    });
  s.h.mount(() => ArtistEditor({ owner: "owner", id: "artist" }));
  edit(s.h, "Artist name", "Still unsent");
  button(s.h.output, "Unpublish artist").props.onClick();
  await s.h.settle();
  assert.equal(s.guards.at(-1).dirty, true);
  assert.equal(s.guards.at(-1).saving, true);
  finishIdentity("owner");
  await s.h.settle();
  s.data = { ...s.data, artist: { ...artist, version: 6 } };
  s.h.render();
  assert.equal(input(s.h.output, "Artist name").props.value, "Still unsent");
  assert.equal(s.guards.at(-1).dirty, true);
  assert.equal(
    s.guards.at(-1).conflict,
    true,
    "A newer remote edit must not be silently adopted"
  );
});

test("clean release waits for accepted version without rolling back to an older snapshot", async () => {
  const s = setup();
  s.handler = async () => ({
    data: { id: "release", version: 8, message: "Saved" }
  });
  const { ArtistReleaseEditor } = s.h.load(root + "artist-release-editor.tsx", {
    ...s.shared,
    "./artist-editor": {
      ArtistCredits: noop,
      ArtistRights: noop,
      rightsInput: noop
    }
  });
  let item = { ...release };
  s.h.mount(() =>
    ArtistReleaseEditor({
      owner: "owner",
      artistId: "artist",
      item,
      visible: true,
      canPublish: true,
      onSaved: noop,
      onClose: noop
    })
  );
  button(s.h.output, "Unpublish release").props.onClick();
  await s.h.settle();
  assert.equal(
    s.guards.at(-1).conflict,
    true,
    "Old read cannot replace accepted version"
  );
  item = { ...item, state: "DRAFT", version: 8 };
  s.h.render();
  assert.equal(s.guards.at(-1).conflict, false);
});

test("delegate snapshot adoption obeys revocation and stays disabled for an uncertain command", async () => {
  const s = setup();
  const { ArtistDelegates } = s.h.load(root + "artist-delegates.tsx", s.shared);
  s.h.mount(() =>
    ArtistDelegates({
      owner: "owner",
      id: "artist",
      data: s.data,
      reload: noop,
      visible: true,
      disabled: false
    })
  );
  edit(
    s.h,
    "Event page link",
    "https://example.test/platform/events/event-one"
  );
  s.handler = async () => {
    throw new Error("lost response");
  };
  submit(s.h, 1);
  await s.h.settle();
  const original = s.calls[0][1];
  s.data = { ...s.data, permissions: { ...permissions, steward: false } };
  s.h.render();
  const adopt = button(
    s.h.output,
    "Review current permissions and keep entries"
  );
  assert.equal(adopt.props.disabled, true);
  adopt.props.onClick();
  s.h.render();
  assert.ok(textContent(s.h.output).includes("details are concealed"));
  button(s.h.output, "Retry exact change").props.onClick();
  await s.h.settle();
  assert.equal(s.calls[1][1], original);
});

test("current permission review conceals revoked controls while retaining dirty entries", () => {
  const s = setup();
  const { ArtistDelegates } = s.h.load(root + "artist-delegates.tsx", s.shared);
  s.h.mount(() =>
    ArtistDelegates({
      owner: "owner",
      id: "artist",
      data: s.data,
      reload: noop,
      visible: true,
      disabled: false
    })
  );
  edit(
    s.h,
    "Event page link",
    "https://example.test/platform/events/event-one"
  );
  s.data = { ...s.data, permissions: { ...permissions, steward: false } };
  s.h.render();
  const adopt = button(
    s.h.output,
    "Review current permissions and keep entries"
  );
  s.visible = false;
  adopt.props.onClick();
  s.h.render();
  assert.equal(nodes(s.h.output, (n) => n.type === "form").length, 0);
  assert.equal(
    nodes(
      s.h.output,
      (n) => n.type === "button" && textContent(n).includes("keep entries")
    ).length,
    0
  );
  s.visible = true;
  s.h.render();
  button(
    s.h.output,
    "Review current permissions and keep entries"
  ).props.onClick();
  s.h.render();
  assert.equal(nodes(s.h.output, (n) => n.type === "form").length, 0);
  assert.equal(s.guards.at(-1).dirty, true);
  assert.equal(s.calls.length, 0);
  button(s.h.output, "Discard concealed permission entries").props.onClick();
  s.h.render();
  assert.equal(s.guards.at(-1).dirty, false);
  assert.equal(s.calls.length, 0);
});

test("foreground continuation rejects concealment and passive online recovery", () => {
  let parent = true,
    available = true;
  const window = new EventTarget(),
    document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      hasFocus: () => true
    });
  const navigator = { onLine: true };
  const h = clientHarness({ window, document, navigator });
  const { useArtistContinuation } = h.load(
    root + "artist-editor-workspace.tsx",
    { "./read-visibility": { useReadVisibility: () => parent } }
  );
  h.mount(() => useArtistContinuation(available));
  const original = h.output.current();
  assert.equal(h.output.visible, true);
  window.dispatchEvent(new Event("blur"));
  h.render();
  assert.equal(h.output.visible, false);
  assert.equal(h.output.current(true), null);
  window.dispatchEvent(new Event("online"));
  h.render();
  assert.equal(h.output.current(true), null);
  window.dispatchEvent(new Event("focus"));
  h.render();
  assert.notEqual(h.output.current(), original);
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  h.render();
  window.dispatchEvent(new Event("focus"));
  h.render();
  assert.equal(h.output.current(true), null);
  document.visibilityState = "visible";
  document.dispatchEvent(new Event("visibilitychange"));
  h.render();
  available = false;
  h.render();
  assert.equal(h.output.visible, false);
  assert.equal(h.output.current(), null);
  assert.equal(typeof h.output.current(true), "number");
  parent = false;
  h.render();
  assert.equal(h.output.current(true), null);
  h.unmount();
});
