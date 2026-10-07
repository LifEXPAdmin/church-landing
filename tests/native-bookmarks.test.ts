import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { gunzipSync } from "node:zlib";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { sessionCookieFixtureName } from "../scripts/session-cookie-fixture.mjs";
import { PortalError } from "../lib/platform/portal-policy";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { handleNativeBookmarkRequest } from "../lib/platform/native-bookmark-boundary";
import { handlePostWorkspaceRequest } from "../lib/platform/post-workspace-boundary";
import {
  apiFailure,
  decodeApiResponse,
  wire,
  type ApiOperation,
  type ApiResponse
} from "../lib/platform/api-contracts";
import { AccountSessionOwnerError } from "../lib/platform/account-sessions";
import { accountConfig } from "../lib/platform/account-config";
import { hashSessionToken } from "../lib/platform/auth";
import { relationshipCommand } from "../lib/platform/relationships";
import { repostCommand } from "../lib/platform/reposts";
import { mediaCatalogCommand } from "../lib/platform/media-catalog-commands";
import { mediaFields } from "../lib/platform/media-catalog-input";
import { MEDIA_POLICY } from "../lib/platform/media-catalog-options";
import {
  nativeReadCursors,
  NATIVE_CURSOR_LIFETIME_MS
} from "../lib/platform/native-read-cursors";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

type Actor = { id: string; token: string };
type Resource = "bookmarks" | "bookmarkCollections" | "bookmarkStatus";
const mutation = (operation: string, fields: Record<string, unknown> = {}) => ({
  operation,
  mutationId: randomUUID(),
  ...fields
});
const save = (postId: string, collectionId: string | null = null) =>
  mutation("save-item", { postId, collectionId, expectedVersion: 0 });
async function fixture(label: string) {
  const author = await createPortalActor(db, label + "author");
  const reader = await createPortalActor(db, label + "reader");
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Fictional native bookmark source",
      publishedAt: new Date(Date.now() - 1000),
      allowReposts: true
    }
  });
  return { author, reader, post };
}
async function collection(actor: Actor, name = "Fictional private collection") {
  return postWorkspaceCommand(
    db,
    actor.token,
    mutation("create-collection", {
      id: randomUUID(),
      name,
      expectedVersion: 0
    })
  );
}
async function call(
  resource: Resource,
  actor?: Actor,
  options: {
    postId?: string;
    body?: object;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    method?: string;
    omitOwner?: boolean;
  } = {}
) {
  const url = new URL(
    resource === "bookmarks"
      ? "/api/platform/v1/bookmarks"
      : resource === "bookmarkCollections"
        ? "/api/platform/v1/bookmark-collections"
        : `/api/platform/v1/posts/${options.postId}/bookmark`,
    process.env.ACCOUNT_ORIGIN!
  );
  for (const [key, value] of Object.entries(options.query ?? {}))
    url.searchParams.set(key, value);
  const headers = new Headers({
    ...(actor
      ? {
          Authorization: "Bearer " + actor.token,
          "X-Expected-Account": actor.id
        }
      : {}),
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers
  });
  if (options.omitOwner) headers.delete("X-Expected-Account");
  const response = await handleNativeBookmarkRequest(
    db,
    new Request(url, {
      method: options.method ?? (options.body ? "POST" : "GET"),
      headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {})
    }),
    resource,
    resource === "bookmarkStatus" ? { postId: options.postId } : {}
  );
  assert.match(response.headers.get("cache-control")!, /private.*no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(response.headers.get("location"), null);
  assert.equal(response.headers.get("x-api-version"), "1");
  for (const header of [
    "authorization",
    "cookie",
    "x-expected-account",
    "x-api-version"
  ])
    assert.ok(
      response.headers.get("vary")!.toLowerCase().split(/,\s*/).includes(header)
    );
  return { response, value: await response.json() };
}
function ok<K extends ApiOperation>(
  operation: K,
  result: Awaited<ReturnType<typeof call>>,
  owner: string
) {
  assert.equal(result.response.status, 200, JSON.stringify(result.value));
  return decodeApiResponse(operation, result.value, owner)
    .data as ApiResponse<K>["data"];
}
function denied(
  result: Awaited<ReturnType<typeof call>>,
  status: number,
  code: string
) {
  assert.equal(result.response.status, status, JSON.stringify(result.value));
  assert.equal(apiFailure.parse(result.value).error.code, code);
  assert.equal(result.value.data, undefined);
}

test("ordinary withdrawn posts deny saved status while retaining only an unavailable bookmark stub", async () => {
  const author = await createPortalActor(db, "bookmarkauthor");
  const reader = await createPortalActor(db, "bookmarkreader");
  const post = await db.platformPost.create({
    data: {
      authorId: author.id,
      content: "Fictional withdrawn bookmark content must not be projected",
      publishedAt: new Date()
    }
  });
  const receipt = await postWorkspaceCommand(db, reader.token, {
    operation: "save-item",
    mutationId: randomUUID(),
    expectedVersion: 0,
    postId: post.id,
    collectionId: null
  });
  const saved = {
    id: receipt.id,
    version: receipt.version,
    collectionId: null
  };
  assert.deepEqual(
    await readPostWorkspace(db, reader.token, {
      view: "saved-status",
      postId: post.id
    }),
    { item: saved }
  );

  await db.platformPost.update({
    where: { id: post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  assert.deepEqual(
    await readPostWorkspace(db, reader.token, { view: "saved" }),
    { items: [{ ...saved, available: false }], nextCursor: null }
  );
  await assert.rejects(
    readPostWorkspace(db, reader.token, {
      view: "saved-status",
      postId: post.id
    }),
    (error: unknown) => error instanceof PortalError && error.status === 404
  );
});

test("native bookmarks require the original account inside reads, new commands and receipt replay", async () => {
  const f = await fixture("bowner");
  const input = save(f.post.id);
  for (const resource of [
    "bookmarks",
    "bookmarkCollections",
    "bookmarkStatus"
  ] as const) {
    const options = { postId: f.post.id };
    denied(await call(resource, undefined, options), 401, "unauthenticated");
    denied(
      await call(resource, f.reader, { ...options, omitOwner: true }),
      400,
      "validation"
    );
    denied(
      await call(resource, f.reader, {
        ...options,
        headers: { "X-Expected-Account": f.author.id }
      }),
      401,
      "account_changed"
    );
  }
  await assert.rejects(
    readPostWorkspace(db, f.reader.token, { view: "saved" }, f.author.id),
    AccountSessionOwnerError
  );
  await assert.rejects(
    postWorkspaceCommand(db, f.reader.token, input, f.author.id),
    AccountSessionOwnerError
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.reader.id } }),
    0
  );
  const receipt = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: input }),
    f.reader.id
  );
  await assert.rejects(
    postWorkspaceCommand(db, f.reader.token, input, f.author.id),
    AccountSessionOwnerError
  );
  denied(
    await call("bookmarks", f.reader, {
      body: input,
      headers: { "X-Expected-Account": f.author.id }
    }),
    401,
    "account_changed"
  );
  assert.deepEqual(
    ok(
      "bookmarkStatus",
      await call("bookmarkStatus", f.reader, { postId: f.post.id }),
      f.reader.id
    ),
    {
      item: { id: receipt.id, version: receipt.version, collectionId: null }
    }
  );

  // The optional owner also binds the existing publication preflight and its receipt fast path.
  const draftId = randomUUID();
  await postWorkspaceCommand(
    db,
    f.reader.token,
    mutation("save-draft", {
      id: draftId,
      expectedVersion: 0,
      payload: {
        content: "Fictional owner-bound publication",
        replyAudience: "VIEWERS"
      }
    })
  );
  const publish = mutation("publish-draft", {
    id: draftId,
    expectedVersion: 1
  });
  await assert.rejects(
    postWorkspaceCommand(db, f.reader.token, publish, f.author.id),
    AccountSessionOwnerError
  );
  assert.equal(
    (
      await db.privatePostDraft.findUniqueOrThrow({
        where: { ownerId_id: { ownerId: f.reader.id, id: draftId } }
      })
    ).deletedAt,
    null
  );
  const published = await postWorkspaceCommand(
    db,
    f.reader.token,
    publish,
    f.reader.id
  );
  assert.ok(published.postId);
  await assert.rejects(
    postWorkspaceCommand(db, f.reader.token, publish, f.author.id),
    AccountSessionOwnerError
  );

  await db.platformSession.deleteMany({
    where: { tokenHash: hashSessionToken(f.reader.token) }
  });
  denied(await call("bookmarks", f.reader), 401, "unauthenticated");
  denied(
    await call("bookmarks", f.reader, { body: input }),
    401,
    "unauthenticated"
  );
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: f.reader.id, key: input.mutationId }
    }),
    1
  );
});

test("concurrent exact saves, collection versions and remove-resave retries retain the original item identity", async () => {
  const f = await fixture("bretry");
  const own = await collection(f.reader);
  const foreign = await collection(f.author);
  const input = Object.freeze(save(f.post.id));
  const original = JSON.stringify(input);
  const results = await Promise.all([
    call("bookmarks", f.reader, { body: input }),
    call("bookmarks", f.reader, { body: input })
  ]);
  const receipt = ok("bookmarkCommand", results[0], f.reader.id);
  assert.deepEqual(ok("bookmarkCommand", results[1], f.reader.id), receipt);
  assert.deepEqual(
    await postWorkspaceCommand(db, f.reader.token, input),
    receipt
  );
  assert.equal(JSON.stringify(input), original);
  denied(
    await call("bookmarks", f.reader, {
      body: { ...input, collectionId: own.id }
    }),
    409,
    "conflict"
  );
  denied(
    await call("bookmarks", f.reader, { body: save(f.post.id) }),
    409,
    "conflict"
  );
  denied(
    await call("bookmarks", f.reader, {
      body: mutation("move-item", {
        id: receipt.id,
        expectedVersion: receipt.version,
        collectionId: foreign.id
      })
    }),
    404,
    "not_found"
  );
  denied(
    await call("bookmarks", f.author, {
      body: mutation("remove-item", {
        id: receipt.id,
        expectedVersion: receipt.version
      })
    }),
    404,
    "not_found"
  );

  const moves = await Promise.all(
    [own.id, null].map((collectionId) =>
      call("bookmarks", f.reader, {
        body: mutation("move-item", {
          id: receipt.id,
          expectedVersion: receipt.version,
          collectionId
        })
      })
    )
  );
  assert.equal(
    moves.filter((result) => result.response.status === 200).length,
    1
  );
  const conflict = moves.find((result) => result.response.status !== 200)!;
  denied(conflict, 409, "conflict");
  const current = await db.savedPostItem.findUniqueOrThrow({
    where: { id: receipt.id }
  });
  assert.equal(current.version, receipt.version + 1);
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await call("bookmarks", f.reader, { body: input }),
      f.reader.id
    ),
    receipt
  );
  assert.equal(
    (await db.savedPostItem.findUniqueOrThrow({ where: { id: receipt.id } }))
      .version,
    current.version
  );

  const remove = mutation("remove-item", {
    id: receipt.id,
    expectedVersion: current.version
  });
  const removed = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: remove }),
    f.reader.id
  );
  const replacement = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: save(f.post.id) }),
    f.reader.id
  );
  assert.notEqual(replacement.id, receipt.id);
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await call("bookmarks", f.reader, { body: remove }),
      f.reader.id
    ),
    removed
  );
  assert.deepEqual(
    ok(
      "bookmarkCommand",
      await call("bookmarks", f.reader, { body: input }),
      f.reader.id
    ),
    receipt
  );
  assert.deepEqual(
    ok(
      "bookmarkStatus",
      await call("bookmarkStatus", f.reader, { postId: f.post.id }),
      f.reader.id
    ),
    {
      item: {
        id: replacement.id,
        version: replacement.version,
        collectionId: null
      }
    }
  );
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.reader.id } }),
    1
  );
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: f.reader.id } }),
    5
  );
});

test("plain repost bookmarks share the source while quotes retain their distinct content and retry identity", async () => {
  const f = await fixture("brepost");
  const plain = await repostCommand(
    db,
    f.reader.token,
    mutation("repost", {
      sourceId: f.post.id,
      expectedSourceVersion: f.post.version
    })
  );
  const input = save(plain.id);
  const saved = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: input }),
    f.reader.id
  );
  const sourceStatus = ok(
    "bookmarkStatus",
    await call("bookmarkStatus", f.reader, { postId: f.post.id }),
    f.reader.id
  );
  assert.deepEqual(
    ok(
      "bookmarkStatus",
      await call("bookmarkStatus", f.reader, { postId: plain.id }),
      f.reader.id
    ),
    sourceStatus
  );
  assert.equal(sourceStatus.item?.id, saved.id);
  assert.equal(
    (await db.savedPostItem.findUniqueOrThrow({ where: { id: saved.id } }))
      .postId,
    f.post.id
  );
  denied(
    await call("bookmarks", f.reader, {
      body: { ...input, postId: f.post.id }
    }),
    409,
    "conflict"
  );

  const draftId = randomUUID();
  await postWorkspaceCommand(
    db,
    f.reader.token,
    mutation("save-draft", {
      id: draftId,
      expectedVersion: 0,
      payload: {
        content: "Fictional distinct quote words",
        replyAudience: "VIEWERS",
        quoteSourceId: plain.id
      }
    })
  );
  const quote = await postWorkspaceCommand(
    db,
    f.reader.token,
    mutation("publish-draft", { id: draftId, expectedVersion: 1 })
  );
  assert.ok(quote.postId);
  const quoteSaved = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: save(quote.postId) }),
    f.reader.id
  );
  assert.notEqual(quoteSaved.id, saved.id);
  await db.platformPost.update({
    where: { id: f.post.id },
    data: { status: "WITHDRAWN", withdrawnAt: new Date() }
  });
  denied(
    await call("bookmarkStatus", f.reader, { postId: plain.id }),
    404,
    "not_found"
  );
  assert.equal(
    ok(
      "bookmarkStatus",
      await call("bookmarkStatus", f.reader, { postId: quote.postId }),
      f.reader.id
    ).item?.id,
    quoteSaved.id
  );
  const page = ok("bookmarks", await call("bookmarks", f.reader), f.reader.id);
  assert.deepEqual(
    page.items.find((item) => item.id === saved.id),
    {
      id: saved.id,
      version: saved.version,
      collectionId: null,
      available: false
    }
  );
  const quoteItem = page.items.find((item) => item.id === quoteSaved.id);
  assert.ok(quoteItem && "post" in quoteItem);
  assert.equal(quoteItem.post.excerpt, "Fictional distinct quote words");
});

test("current withdrawal, blocking and lost church membership deny native status and fresh saves", async () => {
  for (const change of ["withdraw", "block", "membership"] as const) {
    const f = await fixture("baccess");
    let churchId: string | undefined;
    if (change === "membership") {
      churchId = (
        await db.church.create({
          data: {
            slug: randomUUID(),
            name: "Fictional bookmark church",
            summary: "Isolated fixture"
          }
        })
      ).id;
      await db.churchConnection.createMany({
        data: [f.author, f.reader].map((actor) => ({
          userId: actor.id,
          churchId: churchId!,
          state: "APPROVED" as const
        }))
      });
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { audience: "CHURCH", audienceChurchId: churchId }
      });
    }
    const saved = ok(
      "bookmarkCommand",
      await call("bookmarks", f.reader, { body: save(f.post.id) }),
      f.reader.id
    );
    if (change === "withdraw")
      await db.platformPost.update({
        where: { id: f.post.id },
        data: { status: "WITHDRAWN", withdrawnAt: new Date() }
      });
    else if (change === "block")
      await relationshipCommand(
        db,
        f.reader.token,
        mutation("block", {
          kind: "person",
          targetId: f.author.id,
          expectedVersion: 0,
          desired: true
        })
      );
    else
      await db.churchConnection.updateMany({
        where: { churchId, userId: f.reader.id },
        data: { state: "WITHDRAWN" }
      });
    denied(
      await call("bookmarkStatus", f.reader, { postId: f.post.id }),
      404,
      "not_found"
    );
    denied(
      await call("bookmarks", f.reader, { body: save(f.post.id) }),
      404,
      "not_found"
    );
    assert.deepEqual(
      ok("bookmarks", await call("bookmarks", f.reader), f.reader.id),
      {
        items: [
          {
            id: saved.id,
            version: saved.version,
            collectionId: null,
            available: false
          }
        ],
        nextCursor: null
      }
    );
    // Removing one's unavailable reference does not require access to the source.
    ok(
      "bookmarkCommand",
      await call("bookmarks", f.reader, {
        body: mutation("remove-item", {
          id: saved.id,
          expectedVersion: saved.version
        })
      }),
      f.reader.id
    );
    assert.equal(
      await db.savedPostItem.count({ where: { ownerId: f.reader.id } }),
      0
    );
  }
});

test("native saved cards retain selected excerpts and fresh bounded resource details without source payloads", async () => {
  const f = await fixture("bcards");
  await db.platformPost.update({
    where: { id: f.post.id },
    data: {
      content: "Fictional private body marker",
      contentNote: "Sensitive experience",
      safeExcerpt: "Selected safe preview"
    }
  });
  ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: save(f.post.id) }),
    f.reader.id
  );
  const listing = await db.exchangeListing.create({
    data: {
      ownerId: f.author.id,
      creatorId: f.author.id,
      state: "ACTIVE",
      publishedAt: new Date(),
      confirmedAt: new Date(),
      itemPolicy: "exchange-listings-v3",
      category: "BOOKS",
      condition: "GOOD",
      country: "US",
      placeId: 4887398,
      placeLabel: "Chicago",
      title: "Fictional current listing",
      description: "Fictional private listing detail"
    }
  });
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional event church",
      summary: "Isolated resource fixture",
      communityListed: true
    }
  });
  const calendar = await db.platformCalendar.create({
    data: {
      name: "Fictional private calendar detail",
      creatorId: f.author.id,
      churchId: church.id,
      requestKey: randomUUID(),
      timeZone: "UTC"
    }
  });
  const event = await db.calendarEvent.create({
    data: {
      calendarId: calendar.id,
      requestKey: randomUUID(),
      title: "Fictional series",
      timeZone: "UTC",
      startLocal: "2026-10-10T12:00",
      endLocal: "2026-10-10T13:00",
      visibility: "PUBLIC"
    }
  });
  const occurrence = await db.calendarOccurrence.create({
    data: {
      eventId: event.id,
      ordinal: 0,
      title: "Fictional current event",
      description: "Fictional private event detail",
      onlineUrl: "https://private.example.test/secret",
      organizer: "Fictional private organizer",
      allDay: false,
      timeZone: "UTC",
      startLocal: event.startLocal,
      endLocal: event.endLocal,
      startAt: new Date("2026-10-10T12:00:00.000Z"),
      endAt: new Date("2026-10-10T13:00:00.000Z")
    }
  });
  const volunteerPost = await db.platformPost.create({
    data: {
      authorId: f.author.id,
      authorChurchId: church.id,
      audienceChurchId: church.id,
      content: "Fictional private volunteer source body",
      publishedAt: new Date(Date.now() - 1000)
    }
  });
  const opportunity = await db.volunteerOpportunity.create({
    data: {
      postId: volunteerPost.id,
      title: "Fictional current opportunity",
      contact: "Fictional private volunteer contact",
      requirements: "Fictional private volunteer requirements",
      commitment: "Fictional private volunteer commitment",
      capacity: 3,
      duties: "Fictional private volunteer duties"
    }
  });
  const media = mediaFields({
    title: "Fictional current media",
    description: "Fictional private media detail",
    format: "SERMON",
    presentation: "VIDEO",
    audience: "PUBLIC",
    details: { preachedOn: null },
    sourceUrl: "https://youtu.be/abcdefghijk"
  });
  const reviewed = {
    fields: media,
    acknowledgment: {
      policy: MEDIA_POLICY,
      sourceUrl: media.sourceUrl,
      audience: media.audience,
      accepted: true
    },
    rights: {
      basis: "OWN",
      reviewed: true,
      publicRecording: true,
      textRights: true
    }
  };
  const draftMedia = await mediaCatalogCommand(db, f.author.token, {
    operation: "create",
    mutationId: randomUUID(),
    ownerChurchId: null,
    ...reviewed
  });
  const publishedMedia = await mediaCatalogCommand(db, f.author.token, {
    operation: "publish",
    mutationId: randomUUID(),
    itemId: draftMedia.id,
    expectedVersion: draftMedia.version,
    ...reviewed
  });
  // Keep the typed listing and request together for the deferred shape guard.
  const helpId = randomUUID();
  const help = await db.$transaction(async (tx) => {
    const row = await tx.exchangeListing.create({
      data: {
        id: helpId,
        ownerChurchId: church.id,
        creatorId: f.author.id,
        intent: "CHURCH_NEED",
        helpPurpose: "INTERCHURCH_V1",
        inquiriesEnabled: false,
        title: "Fictional current Church Help request",
        state: "ACTIVE",
        publishedAt: new Date(),
        confirmedAt: new Date(),
        itemPolicy: "exchange-listings-v3",
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago"
      }
    });
    await tx.interchurchHelpRequest.create({
      data: {
        id: helpId,
        listingId: helpId,
        category: "AV",
        duties: "Fictional private help duties",
        dutyClass: "ADULT_LOGISTICS",
        equipmentMode: "NONE",
        startLocal: "2027-01-01T12:00",
        endLocal: "2027-01-01T13:00",
        timeZone: "UTC",
        startAt: new Date("2027-01-01T12:00:00.000Z"),
        endAt: new Date("2027-01-01T13:00:00.000Z"),
        compensation: "VOLUNTARY",
        reimbursement: "Fictional private help reimbursement",
        coordinatorDisplay: "Fictional private help coordinator"
      }
    });
    return row;
  });
  const references = [
    { kind: "exchangeListing", id: listing.id },
    { kind: "eventOccurrence", id: occurrence.id },
    { kind: "volunteerOpportunity", id: opportunity.id },
    { kind: "mediaCatalogItem", id: publishedMedia.id },
    { kind: "exchangeListing", id: help.id }
  ];
  const receipts: Awaited<ReturnType<typeof postWorkspaceCommand>>[] = [];
  for (const resource of references)
    receipts.push(
      await postWorkspaceCommand(
        db,
        f.reader.token,
        mutation("save-resource", { resource, expectedVersion: 0 })
      )
    );
  const page = ok("bookmarks", await call("bookmarks", f.reader), f.reader.id);
  const post = page.items.find((item) => "post" in item);
  assert.ok(post && "post" in post);
  assert.equal(post.post.excerpt, "Selected safe preview");
  assert.equal(post.post.contentNote, "Sensitive experience");
  assert.equal(post.post.publishedAt, f.post.publishedAt!.toISOString());
  assert.deepEqual(
    page.items.find((item) => item.id === receipts[0].id),
    {
      id: receipts[0].id,
      version: 1,
      collectionId: null,
      available: true,
      resource: {
        kind: "exchangeListing",
        id: listing.id,
        title: listing.title,
        href: `/platform/exchange/${listing.id}`,
        state: "Available",
        requiresWeb: true,
        event: null
      }
    }
  );
  assert.deepEqual(
    page.items.find((item) => item.id === receipts[1].id),
    {
      id: receipts[1].id,
      version: 1,
      collectionId: null,
      available: true,
      resource: {
        kind: "eventOccurrence",
        id: occurrence.id,
        title: occurrence.title,
        href: `/platform/events/${occurrence.id}`,
        state: "Event",
        requiresWeb: true,
        event: {
          startAt: occurrence.startAt.toISOString(),
          endAt: occurrence.endAt.toISOString(),
          timeZone: "UTC",
          allDay: false,
          startLocal: occurrence.startLocal,
          endLocal: occurrence.endLocal
        }
      }
    }
  );
  for (const [index, resource] of [
    [
      2,
      {
        kind: "volunteerOpportunity",
        id: opportunity.id,
        title: opportunity.title,
        href: `/platform/serve/${opportunity.id}`,
        state: "Open",
        requiresWeb: true,
        event: null
      }
    ],
    [
      3,
      {
        kind: "mediaCatalogItem",
        id: publishedMedia.id,
        title: media.title,
        href: `/platform/media/${publishedMedia.id}`,
        state: "Sermon",
        requiresWeb: true,
        event: null
      }
    ],
    [
      4,
      {
        kind: "exchangeListing",
        id: help.id,
        title: help.title,
        href: `/platform/exchange/help/${help.id}`,
        state: "Available",
        requiresWeb: true,
        event: null
      }
    ]
  ] as const)
    assert.deepEqual(
      page.items.find((item) => item.id === receipts[index].id),
      {
        id: receipts[index].id,
        version: 1,
        collectionId: null,
        available: true,
        resource
      }
    );
  assert.doesNotMatch(
    JSON.stringify(page),
    /private body|private listing|private event|private calendar|private organizer|private volunteer|private media|private help|private\.example|youtu\.be|abcdefghijk|sourceUrl|ownerId|creatorId/
  );
  await db.calendarOccurrence.update({
    where: { id: occurrence.id },
    data: { title: "Fictional revised event" }
  });
  const fresh = ok(
    "bookmarks",
    await call("bookmarks", f.reader),
    f.reader.id
  ).items.find((item) => item.id === receipts[1].id);
  assert.ok(fresh && "resource" in fresh);
  assert.equal(fresh.resource.title, "Fictional revised event");
  await db.calendarEvent.update({
    where: { id: event.id },
    data: { visibility: "PRIVATE" }
  });
  await db.exchangeListing.update({
    where: { id: listing.id },
    data: { state: "ARCHIVED", erasedAt: new Date() }
  });
  await db.platformPost.update({
    where: { id: volunteerPost.id },
    data: { withdrawnAt: new Date() }
  });
  await mediaCatalogCommand(
    db,
    f.author.token,
    mutation("withdraw-rights", {
      itemId: publishedMedia.id,
      expectedVersion: publishedMedia.version
    })
  );
  await db.interchurchHelpRequest.update({
    where: { id: helpId },
    data: { recoveryRequired: true }
  });
  const unavailable = ok(
    "bookmarks",
    await call("bookmarks", f.reader),
    f.reader.id
  );
  for (const receipt of receipts)
    assert.deepEqual(
      unavailable.items.find((item) => item.id === receipt.id),
      {
        id: receipt.id,
        version: receipt.version,
        collectionId: null,
        available: false
      }
    );
});

test("twenty-item pages preserve unavailable references, collection filters and signed continuation scope", async () => {
  const f = await fixture("bpages");
  const suffix = randomUUID();
  const collections = Array.from({ length: 21 }, (_, index) => ({
    id: `collection_${String(index).padStart(2, "0")}_${suffix}`,
    ownerId: f.reader.id,
    name: `Fictional collection ${index}`
  }));
  await db.savedPostCollection.createMany({ data: collections });
  const items = Array.from({ length: 25 }, (_, index) => ({
    id: `item_${String(index).padStart(2, "0")}_${suffix}`,
    ownerId: f.reader.id,
    collectionId: index < 5 ? collections[0].id : null,
    resourceKind: "eventOccurrence",
    resourceId: `missing_${index}_${suffix}`
  }));
  await db.savedPostItem.createMany({ data: items });
  const first = ok("bookmarks", await call("bookmarks", f.reader), f.reader.id);
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  const second = ok(
    "bookmarks",
    await call("bookmarks", f.reader, { query: { cursor: first.nextCursor } }),
    f.reader.id
  );
  assert.equal(second.items.length, 5);
  assert.equal(second.nextCursor, null);
  assert.deepEqual(
    [...first.items, ...second.items].map((item) => item.id),
    items.map((item) => item.id)
  );
  assert.ok(
    [...first.items, ...second.items].every(
      (item) => !item.available && !("post" in item) && !("resource" in item)
    )
  );
  const cursorKey = wire.text(80, 1, /^[A-Za-z0-9_-]+$/);
  const binding = ["bookmarks", f.reader.id, null];
  const earlier = nativeReadCursors(
    binding,
    cursorKey,
    new Date(Date.now() - 60000)
  ).encode(items[0].id);
  const continuation = ok(
    "bookmarks",
    await call("bookmarks", f.reader, { query: { cursor: earlier } }),
    f.reader.id
  );
  assert.deepEqual(
    continuation.items.map((item) => item.id),
    items.slice(1, 21).map((item) => item.id)
  );
  assert.ok(continuation.nextCursor);
  const cursorExpiry = (cursor: string) =>
    (
      JSON.parse(
        gunzipSync(Buffer.from(cursor.split(".")[0], "base64url"), {
          maxOutputLength: 8192
        }).toString("utf8")
      ) as { expires: number }
    ).expires;
  assert.equal(cursorExpiry(continuation.nextCursor), cursorExpiry(earlier));
  const expired = nativeReadCursors(
    binding,
    cursorKey,
    new Date(Date.now() - NATIVE_CURSOR_LIFETIME_MS - 1)
  ).encode(items[0].id);
  denied(
    await call("bookmarks", f.reader, { query: { cursor: expired } }),
    409,
    "cursor_invalid"
  );
  const filtered = ok(
    "bookmarks",
    await call("bookmarks", f.reader, {
      query: { collectionId: collections[0].id }
    }),
    f.reader.id
  );
  assert.deepEqual(
    filtered.items.map((item) => item.id),
    items.slice(0, 5).map((item) => item.id)
  );
  const unfiled = ok(
    "bookmarks",
    await call("bookmarks", f.reader, { query: { collectionId: "unfiled" } }),
    f.reader.id
  );
  assert.equal(unfiled.items.length, 20);
  assert.equal(unfiled.nextCursor, null);
  denied(
    await call("bookmarks", f.author, {
      query: { collectionId: collections[0].id }
    }),
    404,
    "not_found"
  );
  denied(
    await call("bookmarks", f.author, { query: { cursor: first.nextCursor } }),
    409,
    "cursor_invalid"
  );
  denied(
    await call("bookmarks", f.reader, {
      query: { cursor: first.nextCursor, collectionId: "unfiled" }
    }),
    409,
    "cursor_invalid"
  );
  const tampered =
    (first.nextCursor[0] === "a" ? "b" : "a") + first.nextCursor.slice(1);
  denied(
    await call("bookmarks", f.reader, { query: { cursor: tampered } }),
    409,
    "cursor_invalid"
  );
  denied(
    await call("bookmarks", f.reader, { query: { cursor: items[19].id } }),
    409,
    "cursor_invalid"
  );
  denied(
    await call("bookmarkCollections", f.reader, {
      query: { cursor: first.nextCursor }
    }),
    409,
    "cursor_invalid"
  );
  const collectionPage = ok(
    "bookmarkCollections",
    await call("bookmarkCollections", f.reader),
    f.reader.id
  );
  assert.equal(collectionPage.items.length, 20);
  assert.ok(collectionPage.nextCursor);
  const collectionEnd = ok(
    "bookmarkCollections",
    await call("bookmarkCollections", f.reader, {
      query: { cursor: collectionPage.nextCursor }
    }),
    f.reader.id
  );
  assert.deepEqual(
    [...collectionPage.items, ...collectionEnd.items].map((item) => item.id),
    collections.map((item) => item.id)
  );
  assert.equal(collectionEnd.nextCursor, null);
  assert.deepEqual(
    ok(
      "bookmarkCollections",
      await call("bookmarkCollections", f.author),
      f.author.id
    ),
    { items: [], nextCursor: null }
  );
});

test("native bookmark writes charge the website workspace limiter and reject before consuming a limited body", async () => {
  const f = await fixture("brate");
  const input = save(f.post.id);
  const receipt = ok(
    "bookmarkCommand",
    await call("bookmarks", f.reader, { body: input }),
    f.reader.id
  );
  const web = () =>
    handlePostWorkspaceRequest(
      db,
      new Request(
        new URL("/api/platform/post-workspace", process.env.ACCOUNT_ORIGIN!),
        {
          method: "POST",
          headers: {
            Origin: process.env.ACCOUNT_ORIGIN!,
            Cookie: `${sessionCookieFixtureName()}=${f.reader.token}`,
            "X-Expected-Account": f.reader.id,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(input)
        }
      )
    );
  const webRetry = await web();
  assert.equal(webRetry.status, 200);
  assert.deepEqual(await webRetry.json(), receipt);
  const key = createHmac("sha256", accountConfig().rateSecret)
    .update("post-workspace:" + f.reader.id)
    .digest("hex");
  assert.equal(
    (await db.platformAuthLimit.findUniqueOrThrow({ where: { key } })).hits,
    2
  );
  await db.platformAuthLimit.update({
    where: { key },
    data: { hits: 240, expiresAt: new Date(Date.now() + 900000) }
  });
  let pulls = 0;
  const limited = await handleNativeBookmarkRequest(
    db,
    new Request(
      new URL("/api/platform/v1/bookmarks", process.env.ACCOUNT_ORIGIN!),
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + f.reader.token,
          "X-Expected-Account": f.reader.id,
          "Content-Type": "application/json"
        },
        body: new ReadableStream(
          {
            pull(controller) {
              pulls++;
              controller.close();
            }
          },
          { highWaterMark: 0 }
        ),
        duplex: "half"
      } as RequestInit
    ),
    "bookmarks"
  );
  assert.equal(limited.status, 429);
  assert.equal(pulls, 0);
  assert.equal(limited.headers.get("retry-after"), "900");
  assert.equal(
    apiFailure.parse(await limited.json()).error.retryAfterSeconds,
    900
  );
  const webLimited = await web();
  assert.equal(webLimited.status, 429);
  assert.equal(webLimited.headers.get("retry-after"), "900");
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.reader.id } }),
    1
  );
  assert.equal(
    await db.postWorkspaceOperation.count({
      where: { ownerId: f.reader.id, key: input.mutationId }
    }),
    1
  );
});

test("queued native bookmark reads revalidate session expiry after acquiring the canonical lock", async () => {
  const f = await fixture("blocked");
  let enter!: () => void, release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    enter();
    await released;
    await tx.platformSession.update({
      where: { tokenHash: hashSessionToken(f.reader.token) },
      data: { expiresAt: new Date(Date.now() - 1) }
    });
  });
  await entered;
  let settled = false;
  const reader = call("bookmarks", f.reader).then((result) => {
    settled = true;
    return result;
  });
  try {
    await delay(70);
    assert.equal(settled, false);
  } finally {
    release();
    await writer;
  }
  denied(await reader, 401, "unauthenticated");
});

test("strict native admission rejects browser credentials, unsupported methods and non-bookmark operations without writes", async () => {
  const f = await fixture("badmit");
  const input = save(f.post.id);
  for (const headers of [
    { Origin: process.env.ACCOUNT_ORIGIN! },
    { "Sec-Fetch-Site": "same-origin" }
  ] as Record<string, string>[])
    denied(
      await call("bookmarks", f.reader, { body: input, headers }),
      403,
      "forbidden"
    );
  denied(
    await call("bookmarks", f.reader, {
      headers: { Cookie: `${sessionCookieFixtureName()}=${f.reader.token}` }
    }),
    401,
    "unauthenticated"
  );
  denied(
    await call("bookmarks", f.reader, { headers: { "X-API-Version": "2" } }),
    426,
    "unsupported_version"
  );
  denied(
    await call("bookmarks", f.reader, { query: { ownerId: f.author.id } }),
    400,
    "validation"
  );
  denied(
    await call("bookmarks", f.reader, { method: "DELETE" }),
    405,
    "method_not_allowed"
  );
  denied(
    await call("bookmarkCollections", f.reader, { body: input }),
    405,
    "method_not_allowed"
  );
  denied(
    await call("bookmarkStatus", f.reader, { postId: f.post.id, body: input }),
    405,
    "method_not_allowed"
  );
  for (const body of [
    { ...input, ownerId: f.author.id },
    { ...input, expectedVersion: -1 },
    { ...input, mutationId: "x".repeat(81) },
    mutation("save-draft", {
      id: randomUUID(),
      expectedVersion: 0,
      payload: { content: "Forbidden native draft" }
    }),
    mutation("publish-draft", { id: randomUUID(), expectedVersion: 1 }),
    mutation("create-collection", {
      id: randomUUID(),
      expectedVersion: 0,
      name: "Unsupported native management"
    }),
    mutation("save-resource", {
      expectedVersion: 0,
      resource: { kind: "eventOccurrence", id: "fictional" }
    })
  ])
    denied(await call("bookmarks", f.reader, { body }), 400, "validation");
  assert.equal(
    await db.savedPostItem.count({ where: { ownerId: f.reader.id } }),
    0
  );
  assert.equal(
    await db.postWorkspaceOperation.count({ where: { ownerId: f.reader.id } }),
    0
  );
});
