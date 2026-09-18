import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  seedPortal,
  requestConnection
} from "./seed-portal";
import { portalCommand } from "../lib/platform/portal";
import { SESSION_COOKIE } from "../lib/platform/account-boundary";
import { PortalError } from "../lib/platform/portal-policy";
import { getPost } from "../lib/platform/post-reads";
import { postCommand } from "../lib/platform/post-commands";
import { readFeed } from "../lib/platform/feed-reads";
import { communitySearch } from "../lib/platform/community-search";
import {
  postWorkspaceCommand,
  readPostWorkspace
} from "../lib/platform/post-workspace";
import { uploadImage } from "../lib/platform/media";
import { handleImageDelivery } from "../lib/platform/media-boundary";
import type { ImageStorage } from "../lib/platform/media-storage";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { readExchangeListing } from "../lib/platform/exchange-listings";
import {
  exchangeSavedCommand,
  readExchangeSaved
} from "../lib/platform/exchange-saved";
import {
  exchangeHandoffCommand,
  readExchangeHandoffs
} from "../lib/platform/exchange-handoffs";
import { groupCommand } from "../lib/platform/group-commands";
import { readGroup } from "../lib/platform/group-reads";

const db = new PrismaClient();
const priorReports = process.env.COMMUNITY_REPORTS_ENABLED;
before(async () => {
  await assertPortalTestDatabase(db);
  process.env.COMMUNITY_REPORTS_ENABLED = "true";
});
after(async () => {
  if (priorReports === undefined) delete process.env.COMMUNITY_REPORTS_ENABLED;
  else process.env.COMMUNITY_REPORTS_ENABLED = priorReports;
  await db.$disconnect();
});
const command = (operation: string, data: Record<string, unknown>) => ({
  operation,
  mutationId: randomUUID(),
  ...data
});
const denied = (work: Promise<unknown>) =>
  assert.rejects(
    work,
    (e: unknown) =>
      e instanceof PortalError && [403, 404, 409].includes(e.status)
  );
function storage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(path: string, bytes: Buffer) {
      files.set(path, bytes);
    },
    async get(path: string) {
      return files.get(path) ?? null;
    },
    async delete(paths: string[]) {
      for (const path of paths) files.delete(path);
    }
  } satisfies ImageStorage & { files: Map<string, Buffer> };
}

for (const action of ["LEAVE", "REMOVE"] as const) {
  test(`canonical ${action} conceals saved/search/feed/media/Exchange reads and preserves only personal retained work`, async () => {
    const f = await seedPortal(db),
      actor = f.memberA,
      author = f.contact;
    const marker = `Private membership fixture ${randomUUID()}`;
    const at = new Date(Date.now() - 1000);
    const post = await db.platformPost.create({
      data: {
        authorId: author.id,
        content: marker,
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        publishedAt: at
      }
    });
    const personal = await db.platformPost.create({
      data: {
        authorId: actor.id,
        content: "Retained personal public fixture",
        publishedAt: at
      }
    });
    const draftId = randomUUID();
    await postWorkspaceCommand(
      db,
      actor.token,
      command("save-draft", {
        id: draftId,
        expectedVersion: 0,
        payload: {
          content: "Retained private unsent work",
          audience: "PUBLIC",
          replyAudience: "VIEWERS"
        }
      })
    );
    await postWorkspaceCommand(
      db,
      actor.token,
      command("save-item", {
        postId: post.id,
        expectedVersion: 0
      })
    );
    // A real signed current-page cursor must reauthorize its references after loss.
    await db.friendAcceptance.create({
      data: {
        inviterId: author.id,
        recipientId: actor.id,
        invitationVersion: 1,
        state: "CONNECTED"
      }
    });
    await db.platformFollow.createMany({
      data: [
        { followerId: author.id, followingId: actor.id },
        { followerId: actor.id, followingId: author.id }
      ]
    });
    const feed = await readFeed(db, actor.token, { mode: "friends" });
    assert.ok(feed.posts.some((p) => p.id === post.id));
    assert.ok(feed.pageCursor);
    assert.ok(
      JSON.stringify(
        await readPostWorkspace(db, actor.token, { view: "saved" })
      ).includes(marker)
    );
    assert.equal(
      (await communitySearch(db, actor.token, { q: marker })).items.length,
      1
    );
    const store = storage();
    const image = await uploadImage(
      db,
      author.token,
      {
        purpose: "POST_PHOTO",
        targetId: post.id,
        requestKey: randomUUID(),
        alt: "Fictional blue rectangle",
        caption: "Isolated private image"
      },
      await sharp({
        create: { width: 100, height: 60, channels: 3, background: "blue" }
      })
        .png()
        .toBuffer(),
      store
    );
    const imageRequest = (variant: string) =>
      new Request(
        `https://fixture.example.test/api/platform/images/${image.id}/${variant}?token=obsolete-signed-link`,
        {
          headers: {
            cookie: `${SESSION_COOKIE}=${actor.token}`,
            "if-none-match": "old-etag",
            range: "bytes=0-100"
          }
        }
      );
    for (const variant of ["original", "large", "medium", "thumb"]) {
      const response = await handleImageDelivery(
        db,
        imageRequest(variant),
        image.id,
        variant,
        store
      );
      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control")!, /no-store/);
      assert.equal(response.headers.get("location"), null);
    }
    const listing = await db.exchangeListing.create({
      data: {
        ownerId: author.id,
        creatorId: author.id,
        state: "ACTIVE",
        title: marker,
        description: "Private church audience item",
        category: "FURNITURE",
        condition: "GOOD",
        audience: "CHURCH",
        audienceChurchId: f.churchA.id,
        country: "US",
        placeId: 4887398,
        placeLabel: "Chicago",
        itemPolicy: EXCHANGE_ITEM_POLICY,
        confirmedAt: at,
        publishedAt: at
      }
    });
    await db.socialPreferences.upsert({
      where: { ownerId: author.id },
      create: { ownerId: author.id, contactRequests: "EVERYONE" },
      update: { contactRequests: "EVERYONE" }
    });
    await exchangeHandoffCommand(
      db,
      author.token,
      command("contact", {
        listingId: listing.id,
        expectedVersion: listing.inquiryContactVersion,
        listingVersion: listing.version,
        enabled: true
      })
    );
    const target = (
      await readExchangeHandoffs(db, actor.token, {
        view: "target",
        listingId: listing.id
      })
    ).target!;
    const inquiryInput = command("inquire", {
      id: randomUUID(),
      expectedVersion: 0,
      listingId: listing.id,
      listingVersion: target.listingVersion,
      contactVersion: target.contactVersion,
      purpose: "Private retained request fixture"
    });
    const inquiry = await exchangeHandoffCommand(db, actor.token, inquiryInput);
    await exchangeSavedCommand(
      db,
      actor.token,
      command("favorite-add", { listingId: listing.id, expectedVersion: 0 })
    );
    assert.ok(
      JSON.stringify(
        await readExchangeSaved(db, actor.token, { view: "favorites" })
      ).includes(marker)
    );
    const connection = await db.churchConnection.findUniqueOrThrow({
      where: {
        userId_churchId: { userId: actor.id, churchId: f.churchA.id }
      }
    });
    await portalCommand(
      db,
      action === "LEAVE" ? actor.token : f.reviewerA.token,
      {
        operation: "transition",
        action,
        churchId: f.churchA.id,
        connectionId: connection.id,
        expectedVersion: connection.version
      }
    );
    assert.equal(await getPost(db, actor.token, post.id), null);
    assert.equal(
      (await communitySearch(db, actor.token, { q: marker })).items.length,
      0
    );
    const saved = JSON.stringify(
      await readPostWorkspace(db, actor.token, { view: "saved" })
    );
    assert.ok(!saved.includes(marker) && !saved.includes(post.id));
    const resumed = await readFeed(db, actor.token, {
      mode: "friends",
      cursor: feed.pageCursor
    });
    assert.ok(!JSON.stringify(resumed).includes(marker));
    for (const variant of ["original", "large", "medium", "thumb"]) {
      const response = await handleImageDelivery(
        db,
        imageRequest(variant),
        image.id,
        variant,
        store
      );
      assert.equal(response.status, 404);
      for (const name of [
        "cache-control",
        "cdn-cache-control",
        "vercel-cdn-cache-control"
      ])
        assert.match(response.headers.get(name)!, /no-store/);
      assert.equal(response.headers.get("location"), null);
    }
    await denied(readExchangeListing(db, actor.token, listing.id));
    const favorites = await readExchangeSaved(db, actor.token, {
      view: "favorites"
    });
    assert.equal(favorites.favorites?.length, 1);
    assert.equal(favorites.favorites?.[0].listing, null);
    const requests = await readExchangeHandoffs(db, actor.token, {
      view: "outgoing"
    });
    assert.equal(
      requests.inquiries?.find((row) => row.id === inquiry.id)?.listing,
      null
    );
    assert.equal(
      requests.inquiries?.find((row) => row.id === inquiry.id)?.state,
      "REVOKED"
    );
    assert.ok(!JSON.stringify(requests).includes(marker));
    await denied(exchangeHandoffCommand(db, actor.token, inquiryInput));
    assert.ok((await getPost(db, actor.token, personal.id))?.id);
    assert.ok(
      JSON.stringify(
        await readPostWorkspace(db, actor.token, { view: "draft", id: draftId })
      ).includes("Retained private unsent work")
    );
    assert.equal(
      (await db.platformUser.findUniqueOrThrow({ where: { id: actor.id } }))
        .deactivatedAt,
      null
    );
    // A new approved membership may read the source again, but must not revive old contact consent.
    const nextConnection = await requestConnection(db, actor, f.churchA.id);
    await portalCommand(db, f.reviewerA.token, {
      operation: "transition",
      action: "APPROVE",
      churchId: f.churchA.id,
      connectionId: nextConnection.id,
      expectedVersion: nextConnection.version
    });
    assert.ok(await getPost(db, actor.token, post.id));
    // The contract permits replay of an opaque historical receipt once the
    // source is readable again. It must not restore the former consent/row.
    assert.deepEqual(
      await exchangeHandoffCommand(db, actor.token, inquiryInput),
      inquiry
    );
    // The read projection denied access immediately. The next permitted command
    // settles that revocation durably before replaying its body-free receipt.
    const ended = await db.exchangeInquiry.findUniqueOrThrow({
      where: { id: inquiry.id }
    });
    assert.equal(ended.state, "REVOKED");
    assert.deepEqual(
      await exchangeHandoffCommand(db, actor.token, inquiryInput),
      inquiry
    );
    assert.deepEqual(
      await db.exchangeInquiry.findUniqueOrThrow({ where: { id: inquiry.id } }),
      ended
    );
    assert.equal(
      (
        await readExchangeHandoffs(db, actor.token, { view: "outgoing" })
      ).inquiries?.find((row) => row.id === inquiry.id)?.listing,
      null
    );
  });
}

test("canonical church departure ends official group authority without deleting an independent personal group", async () => {
  const f = await seedPortal(db),
    owner = f.memberA;
  await db.church.update({
    where: { id: f.churchA.id },
    data: { communityListed: true }
  });
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: owner.id,
    capability: "MANAGE_CHURCH_GROUPS",
    expectedVersion: 0
  });
  const create = async (churchId: string | null) => {
    const slug = `revocation-${randomUUID()}`;
    const result = await groupCommand(
      db,
      owner.token,
      command("create", {
        schema: 1,
        slug,
        acceptedRules: true,
        leaderDisclosure: true,
        fields: {
          name: `Fictional retained group ${randomUUID()}`,
          purpose: "Isolated membership boundary",
          rules: "Respect private discussions",
          kind: churchId ? "CHURCH_LIFE" : "INTEREST",
          discovery: "LISTED",
          joinPolicy: "OPEN",
          format: "LOCAL",
          area: "Fictional town",
          topic: "Music",
          churchId
        }
      })
    );
    const post = await postCommand(db, owner.token, {
      operation: "create",
      requestKey: randomUUID(),
      groupId: result.id,
      audience: "GROUP",
      groupThreadKind: "DISCUSSION",
      groupCategory: "GENERAL",
      content: "Private fictional group discussion"
    });
    return { ...result, slug, post };
  };
  const official = await create(f.churchA.id),
    personal = await create(null);
  assert.ok(await getPost(db, owner.token, official.post.id));
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: {
      userId_churchId: { userId: owner.id, churchId: f.churchA.id }
    }
  });
  await portalCommand(db, owner.token, {
    operation: "transition",
    action: "LEAVE",
    churchId: f.churchA.id,
    connectionId: connection.id,
    expectedVersion: connection.version
  });
  assert.equal(await getPost(db, owner.token, official.post.id), null);
  await denied(readGroup(db, owner.token, official.slug));
  assert.ok(await getPost(db, owner.token, personal.post.id));
  assert.equal(
    (await readGroup(db, owner.token, personal.slug)).viewer.member,
    true
  );
  const pending = await requestConnection(db, owner, f.churchA.id);
  await portalCommand(db, f.reviewerA.token, {
    operation: "transition",
    action: "APPROVE",
    churchId: f.churchA.id,
    connectionId: pending.id,
    expectedVersion: pending.version
  });
  assert.equal(await getPost(db, owner.token, official.post.id), null);
  assert.ok(await getPost(db, owner.token, personal.post.id));
});
