// Explicit fictional measurement fixture. Never imported by application code.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@prisma/client";
import sharp from "sharp";
import { assertPortalTestDatabase } from "./seed-portal";
import { readAccountSession } from "../lib/platform/accounts";
import { searchDiscoveryPlaces } from "../lib/platform/discovery-places";
import { processImage, IMAGE_VARIANTS } from "../lib/platform/media-processing";
import { centeredCrop, imageAspect } from "../lib/platform/image-crop";
import { imageStorage } from "../lib/platform/media-storage";

export async function seedResourceBudgetFixture(db: PrismaClient, dir: string) {
  await assertPortalTestDatabase(db);
  assert.equal(
    await db.exchangeListing.count(),
    0,
    "Use a dedicated dense fixture clone"
  );
  assert.equal(await db.gatherGroup.count(), 0);
  assert.ok((await db.platformUser.count()) >= 10000);
  assert.equal(
    await db.platformUser.count({
      where: { NOT: { email: { endsWith: "example.test" } } }
    }),
    0
  );
  const dense = JSON.parse(
    await readFile(join(dir, "dense-actors.json"), "utf8")
  );
  const actors: Array<{ id: string; token: string }> = dense.actors.slice(
    0,
    25
  );
  for (const actor of actors)
    assert.equal((await readAccountSession(db, actor.token))?.id, actor.id);
  const owner = actors[0],
    at = new Date(Date.now() - 60000);
  const placeId = (await searchDiscoveryPlaces("US", "Chicago")).places[0].id;
  const marker = "Fictional resource budget";
  for (let page = 0; page < 24; page++) {
    await db.exchangeListing.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        id: `budget-listing-${String(page * 500 + i).padStart(5, "0")}`,
        ownerId: actors[(page + i) % actors.length].id,
        creatorId: actors[(page + i) % actors.length].id,
        title: `${marker} ${page * 500 + i}`,
        description: "Fictional books offered in an isolated catalog. ".repeat(
          8
        ),
        intent: "SALE",
        state: "ACTIVE",
        currency: "USD",
        priceMinor: (((page * 500 + i) * 53) % 99999) + 1,
        category: "BOOKS",
        condition: "GOOD",
        country: "US",
        placeId,
        placeLabel: "Chicago, Illinois",
        publishedAt: at,
        confirmedAt: at,
        itemPolicy: "exchange-listings-v2"
      }))
    });
  }
  const groupIds = Array.from(
    { length: 1000 },
    (_, i) => `budget-group-${String(i).padStart(4, "0")}`
  );
  await db.gatherGroup.createMany({
    data: groupIds.map((id, i) => ({
      id,
      slug: id,
      name: `${marker} group ${i}`,
      nameKey: `${marker} group ${i}`.toLowerCase(),
      purpose: "An isolated adult service group.",
      rules: "Respect each person's privacy and consent.",
      ownerId: actors[i % actors.length].id,
      creatorId: actors[i % actors.length].id,
      kind: "INTEREST",
      discovery: "LISTED",
      joinPolicy: "APPROVAL",
      format: "LOCAL",
      area: "Fictional town",
      topic: "Service"
    }))
  });
  await db.gatherGroupMembership.createMany({
    data: groupIds.map((groupId, i) => ({
      groupId,
      userId: actors[i % actors.length].id,
      state: "ACTIVE",
      leader: true,
      rulesVersion: 1,
      joinedAt: at,
      rosterVisible: true
    }))
  });
  const calendarIds: string[] = [];
  for (const actor of actors) {
    const calendar = await db.platformCalendar.create({
      data: {
        ownerId: actor.id,
        creatorId: actor.id,
        requestKey: randomUUID(),
        name: "Fictional budget calendar",
        timeZone: "UTC"
      }
    });
    calendarIds.push(calendar.id);
    for (let n = 0; n < 200; n++) {
      const start = new Date(Date.UTC(2026, 9, 1, 9) + n * 3 * 3600000);
      const end = new Date(+start + 3600000);
      const time = {
        startLocal: start.toISOString().slice(0, 16),
        endLocal: end.toISOString().slice(0, 16),
        timeZone: "UTC",
        allDay: false
      };
      await db.calendarEvent.create({
        data: {
          calendarId: calendar.id,
          requestKey: randomUUID(),
          title: `Fictional calendar event ${n}`,
          description: "Fictional isolated event.",
          visibility: "PRIVATE",
          ...time,
          occurrences: {
            create: {
              ordinal: 0,
              title: `Fictional calendar event ${n}`,
              ...time,
              startAt: start,
              endAt: end
            }
          }
        }
      });
    }
  }
  // Reconstruct synthetic image bytes in this clone, not a backup restoration.
  // Original historical artifacts remain untouched. Every measured asset gets
  // current normalized derivatives and a matching manifest before measurement.
  const pixels = Buffer.alloc(1024 * 768 * 3);
  let random = 0x5a1ad;
  for (let i = 0; i < pixels.length; i++) {
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    pixels[i] = random & 255;
  }
  const input = await sharp(pixels, {
    raw: { width: 1024, height: 768, channels: 3 }
  })
    .jpeg({ quality: 82 })
    .toBuffer();
  const store = imageStorage(),
    signal = AbortSignal.timeout(120000);
  const assets = await db.mediaAsset.findMany({
    where: {
      id: { in: dense.media.map((x: { id: string }) => x.id) },
      status: "READY"
    }
  });
  assert.equal(assets.length, 100);
  const processed = new Map<string, Awaited<ReturnType<typeof processImage>>>();
  let storedBytes = 0;
  for (const asset of assets) {
    const aspect = imageAspect(asset.purpose);
    const crop = asset.crop ?? centeredCrop;
    const key = JSON.stringify([aspect, crop]);
    let image = processed.get(key);
    if (!image) {
      image = await processImage(
        input,
        aspect ? { aspect, crop: crop as typeof centeredCrop } : undefined
      );
      processed.set(key, image);
    }
    for (const variant of IMAGE_VARIANTS) {
      await store.put(
        `${asset.storagePrefix}/${variant}.webp`,
        image.files[variant],
        signal
      );
      storedBytes += image.files[variant].length;
    }
    await db.mediaAsset.update({
      where: { id: asset.id },
      data: { variants: image.manifest as unknown as Prisma.InputJsonValue }
    });
  }
  const media = assets.find((x) => x.profileUserId === owner.id)!;
  assert.ok(media);
  for (const table of [
    "ExchangeListing",
    "GatherGroup",
    "GatherGroupMembership",
    "PlatformCalendar",
    "CalendarEvent",
    "CalendarOccurrence",
    "PlatformPost",
    "PlatformPostComment",
    "PlatformFollow",
    "SocialRelationship"
  ])
    await db.$executeRawUnsafe(`ANALYZE "${table}"`);
  const fixture = {
    seededAt: new Date().toISOString(),
    actors,
    calendarIds,
    marker,
    mediaId: media.id,
    counts: {
      accounts: await db.platformUser.count(),
      posts: await db.platformPost.count(),
      comments: await db.platformPostComment.count(),
      listings: await db.exchangeListing.count(),
      groups: await db.gatherGroup.count(),
      events: await db.calendarEvent.count(),
      occurrences: await db.calendarOccurrence.count(),
      follows: await db.platformFollow.count(),
      relationshipPolicies: await db.socialRelationship.count(),
      reconstructedImages: assets.length,
      storedImageBytes: storedBytes
    },
    originalPreserved: true,
    productionWrites: 0,
    externalSends: 0
  };
  await writeFile(
    join(dir, "resource-fixture.json"),
    JSON.stringify(fixture, null, 2),
    { mode: 0o600 }
  );
  return fixture.counts;
}
