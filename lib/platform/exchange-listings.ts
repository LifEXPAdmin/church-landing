import type { ExchangeListing, Prisma, PrismaClient } from "@prisma/client";
import { accountConfig } from "./account-config";
import { activityBudget } from "./account-limits";
import {
  postContext,
  withPostRead,
  type PostContext,
  type PostTx
} from "./post-access";
import { postId, postField } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import { communityAuthorSelect } from "./public-profile";
import { discoveryPlaceLabel, getDiscoveryPlace } from "./discovery-places";
import {
  EXCHANGE_EDITOR_SCHEMA,
  EXCHANGE_ITEM_POLICY,
  EXCHANGE_PHOTO_LIMIT,
  type ExchangeState
} from "./exchange-options";
import {
  exchangeEditorFields,
  parseExchangeFields,
  type ExchangeListingFields
} from "./exchange-input";
import {
  exchangeAuthority,
  exchangeCanManage,
  exchangeDiscoveryWhere,
  exchangeManagementWhere,
  exchangeReadableWhere,
  exchangeReportScope,
  requireExchangeActor,
  type ExchangeAuthority
} from "./exchange-policy";
import { communityReportIntakeAvailable } from "./community-reports";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { recordDiscoveryControl } from "./retention-controls";
import { listImagesIn } from "./media";
import { imagesAvailable } from "./media-storage";

export const EXCHANGE_PAGE_SIZE = 20;
const publicSelect = {
  id: true,
  version: true,
  title: true,
  description: true,
  intent: true,
  category: true,
  condition: true,
  currency: true,
  priceMinor: true,
  requestedItems: true,
  neededBy: true,
  serviceArea: true,
  availability: true,
  qualifications: true,
  servicePricing: true,
  serviceUnit: true,
  country: true,
  placeId: true,
  placeLabel: true,
  audience: true,
  audienceChurchId: true,
  state: true,
  publishedAt: true,
  updatedAt: true,
  owner: { select: communityAuthorSelect },
  ownerChurch: { select: { id: true, slug: true, name: true } }
} as const;
// Cards use one bounded query and only their displayed fields. Full service,
// request and item text stays on the authorized detail/editor projection.
const cardSelect = {
  id: true,
  version: true,
  title: true,
  description: true,
  intent: true,
  currency: true,
  priceMinor: true,
  servicePricing: true,
  serviceUnit: true,
  country: true,
  placeLabel: true,
  audience: true,
  state: true,
  publishedAt: true,
  updatedAt: true,
  owner: { select: { name: true } },
  ownerChurch: { select: { name: true } }
} as const;
function project<T extends { publishedAt: Date | null; updatedAt: Date }>(
  row: T
) {
  return {
    ...row,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}
function fieldsOf(
  row: Pick<ExchangeListing, keyof ExchangeListingFields>
): ExchangeListingFields {
  // Stored values were validated at the write boundary. Revalidate publication
  // from the complete current snapshot rather than trusting an old saved form.
  return {
    intent: row.intent,
    title: row.title,
    description: row.description,
    category: row.category as ExchangeListingFields["category"],
    condition: row.condition as ExchangeListingFields["condition"],
    currency: row.currency as ExchangeListingFields["currency"],
    priceMinor: row.priceMinor,
    country: row.country,
    placeId: row.placeId,
    audience: row.audience,
    audienceChurchId: row.audienceChurchId,
    requestedItems: row.requestedItems,
    neededBy: row.neededBy,
    serviceArea: row.serviceArea,
    availability: row.availability,
    qualifications: row.qualifications,
    servicePricing:
      row.servicePricing as ExchangeListingFields["servicePricing"],
    serviceUnit: row.serviceUnit as ExchangeListingFields["serviceUnit"]
  };
}
async function actorContext(tx: PostTx, actorId: string) {
  const context = await postContext(tx, actorId);
  requireExchangeActor(context);
  return { context, authority: await exchangeAuthority(tx, context) };
}
async function manage(
  tx: PostTx,
  context: PostContext,
  authority: ExchangeAuthority,
  id: unknown
) {
  const row = await tx.exchangeListing.findFirst({
    where: {
      AND: [{ id: postId(id) }, exchangeManagementWhere(context, authority)]
    }
  });
  if (!row)
    throw new PortalError(
      404,
      "This listing is unavailable to your current account or church duties."
    );
  if (row.ownerChurchId)
    await requirePrivilegedAuthentication(tx, context.actorId!);
  return row;
}
async function locality(fields: ExchangeListingFields) {
  const place = await getDiscoveryPlace(fields.country, fields.placeId);
  return { ...fields, placeLabel: place ? discoveryPlaceLabel(place) : null };
}
function audience(
  context: PostContext,
  fields: ExchangeListingFields,
  ownerChurchId: string | null
) {
  if (fields.intent === "CHURCH_NEED" && !ownerChurchId)
    throw new PortalError(
      403,
      "A Church need must be owned by a church with an explicit Exchange delegate. Personal membership does not authorize speaking for a church."
    );
  if (
    fields.audience === "CHURCH" &&
    fields.audienceChurchId &&
    (!context.churches.includes(fields.audienceChurchId) ||
      (ownerChurchId !== null && fields.audienceChurchId !== ownerChurchId))
  )
    throw new PortalError(
      403,
      "Choose your currently approved church. Church-owned listings may use only their own church audience."
    );
}
async function publication(
  tx: PostTx,
  context: PostContext,
  authority: ExchangeAuthority,
  row: Pick<ExchangeListing, "ownerChurchId" | "moderationState">,
  fields: ExchangeListingFields,
  input: Record<string, unknown>,
  editing = false
) {
  if (!editing && row.moderationState !== "VISIBLE")
    throw new PortalError(
      409,
      "This listing has a review restriction. Use your decision notice to request reconsideration."
    );
  if (input.itemPolicy !== EXCHANGE_ITEM_POLICY || input.itemConfirmed !== true)
    throw new PortalError(
      400,
      "Review the listing and privacy guidance, then confirm that you may publish this listing and have described it honestly."
    );
  audience(context, fields, row.ownerChurchId);
  if (row.ownerChurchId) {
    if (!authority.managers.includes(row.ownerChurchId))
      throw new PortalError(
        403,
        "A current church Exchange manager must publish this listing."
      );
    if (
      fields.audience === "PUBLIC" &&
      !(await tx.church.findFirst({
        where: { id: row.ownerChurchId, communityListed: true },
        select: { id: true }
      }))
    )
      throw new PortalError(
        403,
        "The church must have a public directory presence before publishing a public church listing."
      );
  }
  if (
    !(await communityReportIntakeAvailable(
      tx,
      exchangeReportScope({
        ownerChurchId: row.ownerChurchId,
        audience: fields.audience,
        audienceChurchId: fields.audienceChurchId
      }),
      null,
      "EXCHANGE_LISTING"
    ))
  )
    throw new PortalError(
      503,
      "Listing reports do not currently have an available reviewer for this audience. Your saved draft remains private."
    );
}
async function capacity(
  tx: PostTx,
  actorId: string,
  ownerChurchId: string | null
) {
  const where = ownerChurchId
    ? { ownerChurchId }
    : { ownerId: actorId, ownerChurchId: null };
  if ((await tx.exchangeListing.count({ where })) >= 1000)
    throw new PortalError(
      429,
      "These listings need a storage review before adding another. Your saved listings are unchanged."
    );
}
async function activity(
  tx: PostTx,
  actorId: string,
  kind: "create" | "publish"
) {
  const retry = await activityBudget(
    tx,
    accountConfig().rateSecret,
    actorId,
    `exchange-${kind}`,
    10,
    3600
  );
  if (retry)
    throw new PortalError(
      429,
      "You have reached the listing activity limit. Keep your entries and try again later.",
      retry
    );
}
async function audit(
  tx: PostTx,
  row: ExchangeListing,
  actorId: string,
  action: string
) {
  await tx.exchangeListingAudit.create({
    data: { listingId: row.id, actorId, action, version: row.version }
  });
  await recordDiscoveryControl(
    tx,
    "EXCHANGE_VISIBILITY",
    actorId,
    row.id,
    row.visibilityVersion
  );
}
const transitions: Record<ExchangeState, readonly ExchangeState[]> = {
  DRAFT: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["RESERVED", "CLOSED", "ARCHIVED"],
  RESERVED: ["ACTIVE", "CLOSED", "ARCHIVED"],
  CLOSED: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: ["DRAFT"]
};

export function exchangeListingCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = input.operation;
  const common = ["operation", "mutationId", "expectedVersion"];
  socialInput(
    input,
    op === "create"
      ? [...common, "ownerChurchId", "schema", "fields"]
      : op === "save"
        ? [
            ...common,
            "listingId",
            "schema",
            "fields",
            "itemPolicy",
            "itemConfirmed"
          ]
        : op === "status"
          ? [...common, "listingId", "state", "itemPolicy", "itemConfirmed"]
          : op === "photo-metadata"
            ? [
                ...common,
                "listingId",
                "imageId",
                "imageVersion",
                "caption",
                "alt"
              ]
            : op === "photo-order"
              ? [...common, "listingId", "images"]
              : [...common, "listingId"]
  );
  if (
    ![
      "create",
      "save",
      "status",
      "duplicate",
      "photo-metadata",
      "photo-order"
    ].includes(String(op))
  )
    throw new PortalError(400, "Choose a supported listing action.");
  return socialCommand(
    db,
    token,
    "exchange",
    input,
    async (tx, actorId) => {
      const { context, authority } = await actorContext(tx, actorId);
      if (op === "create") {
        expected(input.expectedVersion, 0);
        const ownerChurchId =
          input.ownerChurchId === null ? null : postId(input.ownerChurchId);
        if (ownerChurchId) {
          await requirePrivilegedAuthentication(tx, actorId);
          if (
            !authority.publishers.includes(ownerChurchId) &&
            !authority.managers.includes(ownerChurchId)
          )
            throw new PortalError(
              403,
              "You need an explicit Exchange duty to create a listing owned by this church."
            );
        }
        const fields = parseExchangeFields(input.schema, input.fields);
        audience(context, fields, ownerChurchId);
        await capacity(tx, actorId, ownerChurchId);
        await activity(tx, actorId, "create");
        const row = await tx.exchangeListing.create({
          data: {
            ...(await locality(fields)),
            ownerId: ownerChurchId ? null : actorId,
            ownerChurchId,
            creatorId: actorId
          }
        });
        await audit(tx, row, actorId, "CREATE");
        return {
          id: row.id,
          version: row.version,
          message: "Private listing draft saved."
        };
      }
      const row = await manage(tx, context, authority, input.listingId);
      expected(input.expectedVersion, row.version);
      if (op === "duplicate") {
        if (row.moderationState !== "VISIBLE")
          throw new PortalError(
            409,
            "A listing under review cannot be duplicated to bypass its restriction."
          );
        await capacity(tx, actorId, row.ownerChurchId);
        await activity(tx, actorId, "create");
        const fields = fieldsOf(row);
        const copy = await tx.exchangeListing.create({
          data: {
            ...fields,
            placeLabel: row.placeLabel,
            ownerId: row.ownerId,
            ownerChurchId: row.ownerChurchId,
            creatorId: actorId
          }
        });
        await audit(tx, copy, actorId, "DUPLICATE");
        return {
          id: copy.id,
          version: copy.version,
          message:
            "A new private draft is saved. Review its audience and select any photos deliberately before publishing."
        };
      }
      let data: Prisma.ExchangeListingUncheckedUpdateInput;
      if (op === "photo-metadata" || op === "photo-order") {
        if (row.state === "ARCHIVED")
          throw new PortalError(
            409,
            "Reopen this archived listing privately before changing photos."
          );
        const images = await tx.mediaAsset.findMany({
          where: {
            exchangeListingId: row.id,
            purpose: "EXCHANGE_PHOTO",
            status: "READY"
          },
          take: EXCHANGE_PHOTO_LIMIT + 1
        });
        if (images.length > EXCHANGE_PHOTO_LIMIT)
          throw new PortalError(409, "This gallery needs a size review.");
        if (op === "photo-metadata") {
          const image = images.find((i) => i.id === postId(input.imageId));
          if (!image)
            throw new PortalError(
              404,
              "This photo is unavailable in the selected listing."
            );
          expected(input.imageVersion, image.version);
          await tx.mediaAsset.update({
            where: { id: image.id },
            data: {
              caption: postField(input.caption, 500),
              alt: postField(input.alt, 300),
              version: { increment: 1 }
            }
          });
        } else {
          if (
            await tx.mediaAsset.count({
              where: {
                exchangeListingId: row.id,
                status: "UPLOADING",
                leaseUntil: { gt: new Date() }
              }
            })
          )
            throw new PortalError(
              409,
              "Finish pending uploads before reordering listing photos."
            );
          if (
            !Array.isArray(input.images) ||
            input.images.length !== images.length ||
            input.images.length > EXCHANGE_PHOTO_LIMIT
          )
            throw new PortalError(
              409,
              "Reload the complete listing gallery before reordering it."
            );
          const ordered = input.images.map((value) => {
            socialInput(value, ["id", "version"]);
            const image = images.find((i) => i.id === postId(value.id));
            if (!image)
              throw new PortalError(
                409,
                "A photo is no longer part of this listing."
              );
            expected(value.version, image.version);
            return image;
          });
          if (new Set(ordered.map((i) => i.id)).size !== images.length)
            throw new PortalError(400, "Include every photo exactly once.");
          for (const [position, image] of ordered.entries())
            await tx.mediaAsset.update({
              where: { id: image.id },
              data: { position, version: { increment: 1 } }
            });
        }
        data = {};
      } else if (op === "save") {
        if (row.state === "ARCHIVED")
          throw new PortalError(
            409,
            "Reopen this archived listing as a private draft before editing."
          );
        const published = row.state !== "DRAFT";
        const fields = parseExchangeFields(
          input.schema,
          input.fields,
          published
        );
        audience(context, fields, row.ownerChurchId);
        if (published)
          await publication(tx, context, authority, row, fields, input, true);
        data = {
          ...(await locality(fields)),
          ...(published
            ? { itemPolicy: EXCHANGE_ITEM_POLICY, confirmedAt: new Date() }
            : {})
        };
      } else {
        const state = input.state as ExchangeState;
        if (!transitions[row.state].includes(state))
          throw new PortalError(
            409,
            "This listing status changed or the requested transition is unavailable. Refresh its current status."
          );
        if (state === "ACTIVE") {
          const fields = parseExchangeFields(
            EXCHANGE_EDITOR_SCHEMA,
            exchangeEditorFields(fieldsOf(row)),
            true
          );
          await locality(fields);
          await publication(tx, context, authority, row, fields, input);
          if (
            await tx.mediaAsset.count({
              where: {
                exchangeListingId: row.id,
                status: "UPLOADING",
                leaseUntil: { gt: new Date() }
              }
            })
          )
            throw new PortalError(
              409,
              "Finish or remove pending photo uploads before publishing this listing."
            );
          await activity(tx, actorId, "publish");
        }
        data = {
          state,
          ...(state === "ACTIVE"
            ? {
                publishedAt: new Date(),
                itemPolicy: EXCHANGE_ITEM_POLICY,
                confirmedAt: new Date(),
                recoveryRequired: false
              }
            : {})
        };
      }
      const saved = await tx.exchangeListing.update({
        where: { id: row.id },
        data: {
          ...data,
          version: { increment: 1 },
          visibilityVersion: { increment: 1 }
        }
      });
      await audit(
        tx,
        saved,
        actorId,
        op === "status" ? `STATUS_${saved.state}` : String(op).toUpperCase()
      );
      return {
        id: saved.id,
        version: saved.version,
        message:
          op === "status" ? "Listing status updated." : "Listing changes saved."
      };
    },
    async (tx, actorId) => {
      const { context, authority } = await actorContext(tx, actorId);
      if (op !== "create")
        await manage(tx, context, authority, input.listingId);
      else if (input.ownerChurchId !== null) {
        const church = postId(input.ownerChurchId);
        await requirePrivilegedAuthentication(tx, actorId);
        if (
          !authority.publishers.includes(church) &&
          !authority.managers.includes(church)
        )
          throw new PortalError(
            403,
            "Your church Exchange duty is no longer available. Refresh your current access."
          );
      }
    }
  );
}

export function readExchangeListing(
  db: PrismaClient,
  token: unknown,
  id: unknown,
  management = false
) {
  return withPostRead(db, token, async (tx, context) => {
    const authority = await exchangeAuthority(tx, context);
    if (management) requireExchangeActor(context);
    const where = management
      ? exchangeManagementWhere(context, authority)
      : exchangeReadableWhere(context);
    const row = await tx.exchangeListing.findFirst({
      where: { AND: [{ id: postId(id) }, where] },
      select: {
        ...publicSelect,
        ownerId: true,
        ownerChurchId: true,
        creatorId: true,
        erasedAt: true,
        moderationState: true,
        confirmedAt: true,
        itemPolicy: true,
        recoveryRequired: true
      }
    });
    if (!row) throw new PortalError(404, "This listing is unavailable.");
    const {
      ownerId,
      ownerChurchId,
      creatorId,
      erasedAt,
      moderationState,
      confirmedAt,
      itemPolicy,
      recoveryRequired,
      ...visible
    } = row;
    return {
      listing: project(visible),
      viewerId: context.actorId,
      canManage: exchangeCanManage(context, authority, {
        ownerId,
        ownerChurchId,
        creatorId,
        erasedAt,
        state: row.state
      }),
      ...(management
        ? {
            fields: exchangeEditorFields(fieldsOf(row)),
            moderationState,
            recoveryRequired,
            confirmedAt: confirmedAt?.toISOString() ?? null,
            itemPolicy
          }
        : {})
    };
  });
}
export function listExchangeListings(
  db: PrismaClient,
  token: unknown,
  query: {
    mine?: boolean;
    after?: string;
    intent?: import("./exchange-options").ExchangeIntent;
    category?: import("./exchange-options").ExchangeCategory;
    state?: ExchangeState;
    q?: string;
    country?: string;
    placeId?: number;
  } = {}
) {
  return withPostRead(db, token, async (tx, context) => {
    if (query.state && !query.mine)
      throw new PortalError(400, "Status filters belong to My listings.");
    const search = query.q?.replace(/[\\%_]/g, "\\$&");
    const authority = query.mine
      ? await exchangeAuthority(tx, context)
      : { publishers: [], managers: [], moderators: [] };
    if (query.mine) requireExchangeActor(context);
    const where: Prisma.ExchangeListingWhereInput = {
      AND: [
        query.mine
          ? exchangeManagementWhere(context, authority)
          : exchangeDiscoveryWhere(context),
        {
          ...(query.intent ? { intent: query.intent } : {}),
          ...(query.category ? { category: query.category } : {}),
          ...(query.state ? { state: query.state } : {}),
          ...(search
            ? {
                OR: [
                  "title",
                  "description",
                  "requestedItems",
                  "serviceArea"
                ].map((key) => ({
                  [key]: { contains: search, mode: "insensitive" }
                }))
              }
            : {}),
          ...(query.country ? { country: query.country } : {}),
          ...(query.placeId ? { placeId: query.placeId } : {})
        }
      ]
    };
    const cursor = query.after
      ? await tx.exchangeListing.findFirst({
          where: { AND: [{ id: postId(query.after) }, where] },
          select: { id: true, updatedAt: true, publishedAt: true }
        })
      : null;
    if (query.after && !cursor)
      throw new PortalError(
        409,
        "This listing page changed. Start again from the newest listings."
      );
    const page: Prisma.ExchangeListingWhereInput[] = cursor
      ? [
          {
            OR: query.mine
              ? [
                  { updatedAt: { lt: cursor.updatedAt } },
                  { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }
                ]
              : [
                  { publishedAt: { lt: cursor.publishedAt! } },
                  { publishedAt: cursor.publishedAt, id: { lt: cursor.id } }
                ]
          }
        ]
      : [];
    const rows = await tx.exchangeListing.findMany({
      where: { AND: [where, ...page] },
      select: cardSelect,
      orderBy: [
        query.mine ? { updatedAt: "desc" } : { publishedAt: "desc" },
        { id: "desc" }
      ],
      take: EXCHANGE_PAGE_SIZE + 1
    });
    return {
      listings: rows.slice(0, EXCHANGE_PAGE_SIZE).map((row) => ({
        ...project(row),
        description:
          row.description.length > 220
            ? row.description.slice(0, 220) + "…"
            : row.description
      })),
      viewerId: context.actorId,
      after:
        rows.length > EXCHANGE_PAGE_SIZE
          ? rows[EXCHANGE_PAGE_SIZE - 1].id
          : null
    };
  });
}
export function exchangeEditorContext(db: PrismaClient, token: unknown) {
  return withPostRead(db, token, async (tx, context) => {
    const actorId = requireExchangeActor(context),
      authority = await exchangeAuthority(tx, context);
    const churches = await tx.church.findMany({
      where: { id: { in: context.churches } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 201
    });
    return {
      ownerId: actorId,
      churches,
      publishingChurchIds: [
        ...new Set([...authority.publishers, ...authority.managers])
      ],
      managingChurchIds: authority.managers
    };
  });
}

export function readExchangeGallery(
  db: PrismaClient,
  token: unknown,
  id: unknown
) {
  return withPostRead(db, token, async (tx, context) => {
    const authority = await exchangeAuthority(tx, context);
    const listing = await tx.exchangeListing.findFirst({
      where: {
        id: postId(id),
        OR: [
          exchangeReadableWhere(context),
          exchangeManagementWhere(context, authority)
        ]
      }
    });
    if (!listing)
      throw new PortalError(404, "This listing gallery is unavailable.");
    const canManage =
      listing.state !== "ARCHIVED" &&
      exchangeCanManage(context, authority, listing);
    return {
      ownerId: context.actorId,
      listingId: listing.id,
      listingVersion: listing.version,
      canManage,
      images: await listImagesIn(tx, context, "EXCHANGE_PHOTO", listing.id),
      imagesAvailable: imagesAvailable(),
      limit: EXCHANGE_PHOTO_LIMIT,
      pendingUploads: canManage
        ? await tx.mediaAsset.count({
            where: {
              exchangeListingId: listing.id,
              status: "UPLOADING",
              leaseUntil: { gt: new Date() }
            }
          })
        : 0
    };
  });
}
