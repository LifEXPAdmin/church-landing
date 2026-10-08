import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  type PortalActor
} from "./seed-portal";
import { uploadImage } from "../lib/platform/media";
import type { ImageStorage } from "../lib/platform/media-storage";
import { personalPhotoCommand } from "../lib/platform/personal-photos";
import { updateAccountProfile } from "../lib/platform/accounts";
import { getProfileEditor } from "../lib/platform/profiles";
import { emptyProfileModules } from "../lib/platform/profile-modules";

export function profilePhotoMemoryStore(): ImageStorage {
  const files = new Map<string, Buffer>();
  return {
    async put(path, bytes) {
      assert.ok(!files.has(path));
      files.set(path, Buffer.from(bytes));
    },
    async get(path) {
      return files.get(path) ?? null;
    },
    async delete(paths) {
      paths.forEach((path) => files.delete(path));
    }
  };
}
export async function uploadProfileSectionPhoto(
  db: PrismaClient,
  actor: PortalActor,
  options: {
    audience?: string;
    churchId?: string;
    purpose?: string;
    label?: string;
    store?: ImageStorage;
    targetId?: string;
  } = {}
) {
  const label = options.label ?? `Fictional section photo ${randomUUID()}`;
  const bytes = await sharp({
    create: { width: 180, height: 120, channels: 3, background: "#397186" }
  })
    .png()
    .toBuffer();
  return uploadImage(
    db,
    actor.token,
    {
      purpose: options.purpose ?? "PROFILE_PHOTO",
      targetId: options.targetId ?? actor.id,
      requestKey: randomUUID(),
      caption: label,
      alt: label,
      ...(options.purpose && options.purpose !== "PROFILE_PHOTO"
        ? {}
        : {
            audience: options.audience ?? "MEMBERS",
            audienceChurchId: options.churchId ?? null
          })
    },
    bytes,
    options.store
  );
}
export async function profilePhotoFixture(
  db: PrismaClient,
  store?: ImageStorage
) {
  await assertPortalTestDatabase(db);
  const owner = await createPortalActor(db, "sectionowner"),
    member = await createPortalActor(db, "sectionmember"),
    outsider = await createPortalActor(db, "sectionother");
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional photo section church",
      summary: "Isolated photo reference acceptance"
    }
  });
  await db.churchConnection.createMany({
    data: [owner, member].map((actor) => ({
      userId: actor.id,
      churchId: church.id,
      state: "APPROVED"
    }))
  });
  const photos = {
    public: await uploadProfileSectionPhoto(db, owner, {
      audience: "PUBLIC",
      store,
      label: "Fictional public section photo"
    }),
    members: await uploadProfileSectionPhoto(db, owner, {
      audience: "MEMBERS",
      store,
      label: "Fictional members section photo"
    }),
    private: await uploadProfileSectionPhoto(db, owner, {
      audience: "ONLY_ME",
      store,
      label: "Private owner section marker"
    }),
    church: await uploadProfileSectionPhoto(db, owner, {
      audience: "CHURCH",
      churchId: church.id,
      store,
      label: "Private church section marker"
    })
  };
  return { owner, member, outsider, church, photos, store };
}
export async function changeSectionPhoto(
  db: PrismaClient,
  actor: PortalActor,
  id: string,
  operation: string,
  extra: Record<string, unknown> = {}
) {
  const row = await db.personalPhoto.findUniqueOrThrow({
    where: { assetId: id },
    include: { asset: true }
  });
  return personalPhotoCommand(db, actor.token, {
    operation,
    mutationId: randomUUID(),
    imageId: id,
    expectedVersion: row.version,
    imageVersion: row.asset.version,
    ...extra
  });
}
export async function saveProfileSectionPhotos(
  db: PrismaClient,
  actor: PortalActor,
  photoIds: string[],
  extraModules: Record<string, unknown> = {},
  input: Record<string, unknown> = {}
) {
  const current = await getProfileEditor(db, actor.token);
  return updateAccountProfile(
    db,
    actor.token,
    {
      name: current.name,
      bio: current.bio ?? "",
      location: current.location ?? "",
      website: current.website ?? "",
      interests: current.interests.join(","),
      expectedVersion: current.presentation.version,
      profileModules: {
        ...emptyProfileModules(),
        ...current.presentation.modules,
        photoIds,
        ...extraModules
      },
      ...input
    },
    actor.id
  );
}
