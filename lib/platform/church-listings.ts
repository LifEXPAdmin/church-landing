import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { normalizeEmail } from "./accounts";
import {
  ADULT_POLICY,
  churchSelect,
  eligibility,
  eligibleWhere,
  expected,
  operator,
  portal,
  PortalError
} from "./portal";
import {
  listingFields,
  projectListingData,
  type ListingData
} from "./church-listing-data";

type Tx = Prisma.TransactionClient;
const submissionSelect = {
  id: true,
  kind: true,
  churchId: true,
  baseVersion: true,
  data: true,
  status: true,
  version: true,
  reviewReason: true,
  createdAt: true,
  updatedAt: true
} as const;
const editable = ["DRAFT", "NEEDS_INFORMATION", "REJECTED"];
function string(value: unknown, max: number, min = 1): string {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new PortalError(400, "Check the required fields and their length.");
  return value.trim();
}
export function listingData(value: unknown, complete: boolean): ListingData {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(400, "Check the church details.");
  const input = value as Record<string, unknown>;
  const data = Object.fromEntries(
    Object.entries(listingFields).map(([key, rule]) => [
      key,
      string(
        input[key] ?? (key === "locationModel" ? "NO_BUILDING" : ""),
        rule.max,
        0
      )
    ])
  ) as ListingData;
  if (!["PHYSICAL", "ROTATING", "NO_BUILDING"].includes(data.locationModel))
    throw new PortalError(400, "Choose the church's location model.");
  if (data.website) {
    let url: URL;
    try {
      url = new URL(data.website);
    } catch {
      throw new PortalError(
        400,
        "Use the full public website address, starting with https://."
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !url.hostname.includes(".") ||
      url.hash
    )
      throw new PortalError(
        400,
        "Use a public https:// website without a password or fragment."
      );
    data.website = url.href;
  }
  if (data.publicEmail) {
    const email = normalizeEmail(data.publicEmail);
    if (!email)
      throw new PortalError(
        400,
        "Check the public church email or leave it blank."
      );
    data.publicEmail = email;
  }
  if (data.publicPhone && !/^[+0-9(). -]{7,32}$/.test(data.publicPhone))
    throw new PortalError(
      400,
      "Check the public church phone or leave it blank."
    );
  if (
    complete &&
    (!data.name ||
      (!data.serviceArea && (!data.country || (!data.city && !data.region))))
  )
    throw new PortalError(
      400,
      "Add a church name and either a ministry service area or a city/region with its country."
    );
  return data;
}
const normalized = (value: string) =>
  value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const escaped = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export async function likelyChurchMatches(
  db: Tx | PrismaClient,
  value: unknown,
  omit?: string
) {
  const data = projectListingData(value);
  const terms: Prisma.ChurchWhereInput[] = [];
  if (data.name.trim())
    terms.push({
      name: { contains: escaped(data.name.trim()), mode: "insensitive" }
    });
  if (data.website.trim())
    terms.push({
      website: { equals: data.website.trim(), mode: "insensitive" }
    });
  if (!terms.length) return [];
  return db.church.findMany({
    where: { id: omit ? { not: omit } : undefined, OR: terms },
    select: churchSelect,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: 21
  });
}
async function duplicateExists(tx: Tx, data: ListingData) {
  // Check normalized full identity across all records, independent of the
  // truncated suggestions. A shared name alone never merges congregations.
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Church"
    WHERE lower(regexp_replace(trim("name"), '[^[:alnum:]]+', ' ', 'g')) = ${normalized(data.name)}
      AND ((lower(regexp_replace(trim("country"), '[^[:alnum:]]+', ' ', 'g')) = ${normalized(data.country)}
        AND lower(regexp_replace(trim(concat_ws(' ', "city", "region", "serviceArea")), '[^[:alnum:]]+', ' ', 'g')) = ${normalized([data.city, data.region, data.serviceArea].join(" "))})
        OR (${data.website} <> '' AND lower("website") = ${data.website.toLowerCase()})) LIMIT 1`;
  return rows.length > 0;
}
async function own(tx: Tx, userId: string, input: unknown) {
  const row = await tx.churchListingSubmission.findFirst({
    where: { id: string(input, 100), ownerId: userId }
  });
  if (!row) throw new PortalError(404, "This listing draft is not available.");
  return row;
}
async function reviewAvailable(tx: Tx, ownerId: string) {
  if (
    !(await tx.platformOperatorGrant.count({
      where: {
        capability: "REVIEW_CHURCH_LISTINGS",
        revokedAt: null,
        userId: { not: ownerId },
        user: eligibleWhere
      }
    }))
  )
    throw new PortalError(
      503,
      "Listing review is not accepting submissions yet. Your private draft is saved; you can return to it later."
    );
}
async function decision(
  tx: Tx,
  submissionId: string,
  actorId: string,
  action: string,
  reason: string,
  version: number
) {
  await tx.churchListingDecision.create({
    data: { submissionId, actorId, action, reason, version }
  });
}
export async function getChurchListings(
  db: PrismaClient,
  token: unknown,
  submissionId?: string,
  review = false,
  cursor?: string
) {
  return portal(db, token, async (tx, actor) => {
    if (review) await operator(tx, actor, "REVIEW_CHURCH_LISTINGS");
    const rows = await tx.churchListingSubmission.findMany({
      where: {
        ...(review
          ? {
              status: {
                in: ["SUBMITTED" as const, "NEEDS_INFORMATION" as const]
              }
            }
          : { ownerId: actor.id }),
        ...(submissionId ? { id: submissionId } : {})
      },
      select: submissionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 101,
      ...(!submissionId && cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    if (submissionId && !rows.length)
      throw new PortalError(404, "This listing draft is not available.");
    const selected = submissionId ? rows[0] : undefined;
    const canonical = selected?.churchId
      ? await tx.church.findUnique({
          where: { id: selected.churchId },
          select: churchSelect
        })
      : null;
    return {
      viewer: {
        id: actor.id,
        name: actor.name,
        username: actor.username,
        verified: !!actor.emailVerifiedAt,
        adult:
          !!actor.adultAcknowledgedAt &&
          actor.adultPolicyVersion === ADULT_POLICY,
        version: actor.portalVersion
      },
      review,
      more: rows.length > 100,
      canReview: !!(await tx.platformOperatorGrant.count({
        where: {
          userId: actor.id,
          capability: "REVIEW_CHURCH_LISTINGS",
          revokedAt: null,
          user: eligibleWhere
        }
      })),
      submissions: rows.slice(0, 100).map((row) => ({
        ...row,
        data: projectListingData(row.data),
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      })),
      canonical,
      matches: selected
        ? (
            await likelyChurchMatches(
              tx,
              selected.data,
              selected.churchId ?? undefined
            )
          ).slice(0, 20)
        : [],
      history: selected
        ? await tx.churchListingDecision.findMany({
            where: { submissionId: selected.id },
            select: {
              action: true,
              reason: true,
              version: true,
              createdAt: true
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 50
          })
        : []
    };
  });
}
export async function churchListingCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return portal(db, token, async (tx, actor) => {
    eligibility(actor);
    if (input.operation === "create") {
      const requestKey = string(input.requestKey, 100);
      const kind =
        input.kind === "CORRECTION"
          ? "CORRECTION"
          : input.kind === "COMMUNITY"
            ? "COMMUNITY"
            : null;
      if (!kind)
        throw new PortalError(
          400,
          "Choose a community listing or a correction."
        );
      const churchId =
        kind === "CORRECTION" ? string(input.churchId, 100) : null;
      const existing = await tx.churchListingSubmission.findUnique({
        where: { ownerId_requestKey: { ownerId: actor.id, requestKey } }
      });
      if (existing) {
        if (
          existing.kind !== kind ||
          (kind === "CORRECTION" && existing.churchId !== churchId)
        )
          throw new PortalError(
            409,
            "This draft request was already used. Reload before starting another."
          );
        return { id: existing.id, message: "Your existing draft is ready." };
      }
      if (
        (await tx.churchListingSubmission.count({
          where: {
            ownerId: actor.id,
            createdAt: { gt: new Date(Date.now() - 86400000) }
          }
        })) >= 10
      )
        throw new PortalError(
          429,
          "You have started several drafts today. Continue a saved draft or try again tomorrow."
        );
      const church = churchId
        ? await tx.church.findUnique({
            where: { id: churchId },
            select: churchSelect
          })
        : null;
      if (churchId && !church)
        throw new PortalError(404, "This church is not available.");
      const row = await tx.churchListingSubmission.create({
        data: {
          ownerId: actor.id,
          requestKey,
          kind,
          churchId,
          baseVersion: church?.version,
          data: projectListingData(church ?? {})
        }
      });
      return {
        id: row.id,
        message: "Private draft created. Nothing has been published."
      };
    }
    if (input.operation === "review") {
      await operator(tx, actor, "REVIEW_CHURCH_LISTINGS");
      const row = await tx.churchListingSubmission.findUnique({
        where: { id: string(input.id, 100) }
      });
      if (!row) throw new PortalError(404, "This submission is not available.");
      if (row.ownerId === actor.id)
        throw new PortalError(
          403,
          "Another authorized reviewer must review your submission."
        );
      expected(input.expectedVersion, row.version);
      if (row.status !== "SUBMITTED")
        throw new PortalError(
          409,
          "Only a submitted listing can receive a decision."
        );
      const reason = string(input.reason, 1000);
      const status =
        input.action === "APPROVE"
          ? "PUBLISHED"
          : input.action === "NEEDS_INFORMATION"
            ? "NEEDS_INFORMATION"
            : input.action === "REJECT"
              ? "REJECTED"
              : null;
      if (!status) throw new PortalError(400, "Choose a review decision.");
      let churchId = row.churchId;
      if (status === "PUBLISHED") {
        if (
          !(await tx.platformUser.count({
            where: { id: row.ownerId, ...eligibleWhere }
          }))
        )
          throw new PortalError(
            403,
            "The contributor must still be eligible before publication."
          );
        const data = listingData(row.data, true);
        if (row.kind === "CORRECTION") {
          const current = await tx.church.findUniqueOrThrow({
            where: { id: churchId! }
          });
          expected(row.baseVersion, current.version);
          if (input.publicConfirmed !== true)
            throw new PortalError(
              400,
              "Confirm the reviewed details are suitable for the public church page."
            );
          await tx.church.update({
            where: { id: current.id },
            data: { ...data, version: { increment: 1 } }
          });
        } else {
          if (
            input.distinctConfirmed !== true ||
            input.publicConfirmed !== true
          )
            throw new PortalError(
              400,
              "Confirm this is a distinct church and the details are suitable for publication."
            );
          const church = await tx.church.create({
            data: {
              ...data,
              slug: `church-${randomUUID()}`,
              communityListed: true
            }
          });
          churchId = church.id;
        }
      }
      await tx.churchListingSubmission.update({
        where: { id: row.id },
        data: {
          churchId,
          status,
          reviewReason: reason,
          version: { increment: 1 }
        }
      });
      await decision(tx, row.id, actor.id, status, reason, row.version + 1);
      return { id: row.id, churchId, message: "Review decision saved." };
    }
    const row = await own(tx, actor.id, input.id);
    if (input.operation === "publish" && row.status === "PUBLISHED")
      return {
        id: row.id,
        churchId: row.churchId,
        message: "This listing is already published."
      };
    expected(input.expectedVersion, row.version);
    if (input.operation === "save") {
      if (!editable.includes(row.status))
        throw new PortalError(
          409,
          "Withdraw a pending submission before editing. Published changes need a new correction draft."
        );
      const data = listingData(input.data, false);
      const church = row.churchId
        ? await tx.church.findUniqueOrThrow({
            where: { id: row.churchId },
            select: { version: true }
          })
        : null;
      if (church) expected(input.expectedChurchVersion, church.version);
      // Refreshing the base requires the contributor to recheck the preview;
      // approval still compares it against the canonical version in transaction.
      await tx.churchListingSubmission.update({
        where: { id: row.id },
        data: {
          data,
          baseVersion: church?.version,
          status: "DRAFT",
          version: { increment: 1 }
        }
      });
      return {
        id: row.id,
        message: "Private draft saved. Review the preview before submitting."
      };
    }
    if (input.operation === "withdraw") {
      if (
        !["DRAFT", "SUBMITTED", "NEEDS_INFORMATION", "REJECTED"].includes(
          row.status
        )
      )
        throw new PortalError(409, "This submission cannot be withdrawn.");
      await tx.churchListingSubmission.update({
        where: { id: row.id },
        data: { status: "WITHDRAWN", version: { increment: 1 } }
      });
      await decision(
        tx,
        row.id,
        actor.id,
        "WITHDRAWN",
        "Withdrawn by the contributor.",
        row.version + 1
      );
      return {
        id: row.id,
        message: "Submission withdrawn. Public church information is unchanged."
      };
    }
    if (input.operation !== "publish")
      throw new PortalError(400, "Choose a supported listing action.");
    if (!editable.includes(row.status))
      throw new PortalError(
        409,
        "This submission has already been sent or withdrawn."
      );
    if (input.publicConfirmed !== true || input.searchedConfirmed !== true)
      throw new PortalError(
        400,
        "Check for an existing church and confirm the preview is intended to be public."
      );
    const data = listingData(row.data, true);
    if (
      (await tx.churchListingSubmission.count({
        where: {
          ownerId: actor.id,
          submittedAt: { gt: new Date(Date.now() - 86400000) }
        }
      })) >= 3
    )
      throw new PortalError(
        429,
        "You have submitted several listings today. Your draft is saved; try again tomorrow."
      );
    const needsReview =
      row.kind === "CORRECTION" ||
      (await duplicateExists(tx, data)) ||
      (await likelyChurchMatches(tx, data)).length > 0 ||
      (data.summary.match(/https?:\/\//g)?.length ?? 0) > 2;
    if (needsReview) await reviewAvailable(tx, actor.id);
    const church = !needsReview
      ? await tx.church.create({
          data: {
            ...data,
            slug: `church-${randomUUID()}`,
            communityListed: true
          }
        })
      : null;
    const status = needsReview ? "SUBMITTED" : "PUBLISHED";
    await tx.churchListingSubmission.update({
      where: { id: row.id },
      data: {
        churchId: church?.id ?? row.churchId,
        status,
        submittedAt: new Date(),
        version: { increment: 1 },
        reviewReason: ""
      }
    });
    await decision(
      tx,
      row.id,
      actor.id,
      status,
      needsReview
        ? "Submitted for review; no public information changed."
        : "Contributor confirmed a distinct public community listing.",
      row.version + 1
    );
    return {
      id: row.id,
      churchId: church?.id ?? row.churchId,
      message: needsReview
        ? "Submitted for review. The public church page has not changed."
        : "Community listing published. This does not grant church management access."
    };
  });
}
