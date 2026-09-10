import { verifiedChurchManagement } from "./church-management";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type ChurchClaim } from "@prisma/client";
import { normalizeEmail } from "./accounts";
import {
  portal,
  PortalError,
  eligibility,
  eligibleWhere,
  expected,
  churchSelect,
  ADULT_POLICY
} from "./portal";
import { listingData, likelyChurchMatches } from "./church-listings";
import { projectListingData } from "./church-listing-data";
import {
  authorityFields,
  claimScopes,
  projectClaimAuthority,
  type ClaimScope
} from "./church-claim-data";

type Tx = Prisma.TransactionClient;
export const CLAIM_POLICY = "manual-review-v1";
export const claimReviewEnabled = () =>
  process.env.CHURCH_CLAIM_REVIEW_ENABLED === "true" &&
  process.env.CHURCH_CLAIM_POLICY_VERSION === CLAIM_POLICY;
function enabled() {
  if (!claimReviewEnabled())
    throw new PortalError(
      503,
      "Representative review is not accepting submissions yet. Your private setup draft is saved."
    );
}
function string(value: unknown, max = 100, min = 1) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new PortalError(400, "Check the required fields and their length.");
  return value.trim();
}
function authorityData(value: unknown, complete = false) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new PortalError(400, "Check the private authority details.");
  const data = projectClaimAuthority(value);
  for (const [key, rule] of Object.entries(authorityFields))
    data[key as keyof typeof data] = string(
      data[key as keyof typeof data],
      rule.max,
      0
    );
  if (!["PHONE", "EMAIL", "VIDEO", "OTHER"].includes(data.method))
    throw new PortalError(400, "Choose a review method.");
  if (
    data.contact &&
    data.method === "PHONE" &&
    !/^[+0-9(). -]{7,32}$/.test(data.contact)
  )
    throw new PortalError(
      400,
      "Check the private callback number, or choose another review method."
    );
  if (data.contact && data.method === "EMAIL" && !normalizeEmail(data.contact))
    throw new PortalError(400, "Check the private review email.");
  if (
    complete &&
    (!data.position ||
      !data.leader ||
      !data.reference ||
      !data.contact ||
      !data.availability)
  )
    throw new PortalError(
      400,
      "Add your responsibility, confirming leader, private contact, availability or accessibility needs, and an authority reference."
    );
  return data;
}
function scopesData(value: unknown): ClaimScope[] {
  const values = Array.isArray(value)
    ? value
    : Object.keys(claimScopes).filter(
        (key) =>
          value &&
          typeof value === "object" &&
          (value as Record<string, unknown>)[key] === true
      );
  if (
    values.length > 4 ||
    values.some(
      (key) => typeof key !== "string" || !Object.hasOwn(claimScopes, key)
    )
  )
    throw new PortalError(400, "Choose only the listed church permissions.");
  return [...new Set(values)].sort() as ClaimScope[];
}
async function activeGrants(tx: Tx, userId: string, churchId?: string) {
  const rows = await tx.churchCapabilityGrant.findMany({
    where: { userId, churchId, revokedAt: null, user: eligibleWhere },
    include: { dependency: true, church: { select: churchSelect } }
  });
  return rows.filter(
    (row) =>
      !row.dependency ||
      (row.dependency.userId === userId &&
        row.dependency.churchId === row.churchId &&
        row.dependency.state === "APPROVED")
  );
}
async function isOperator(tx: Tx, userId: string) {
  return !!(await tx.platformOperatorGrant.count({
    where: {
      userId,
      capability: "REVIEW_CHURCH_CLAIMS",
      revokedAt: null,
      user: eligibleWhere
    }
  }));
}
async function canReview(
  tx: Tx,
  userId: string,
  claim: Pick<ChurchClaim, "ownerId" | "kind" | "churchId" | "scopes">
) {
  if (claim.ownerId === userId) return false;
  if (await isOperator(tx, userId)) return true;
  if (claim.kind !== "ACCESS" || !claim.churchId) return false;
  const scopes = (await activeGrants(tx, userId, claim.churchId)).map(
    (row) => row.capability
  );
  return (
    scopes.includes("MANAGE_CHURCH_ACCESS") &&
    claim.scopes.every((scope) => scopes.includes(scope))
  );
}
async function requireReview(tx: Tx, userId: string, claim: ChurchClaim) {
  if (!(await canReview(tx, userId, claim)))
    throw new PortalError(
      403,
      "An independent reviewer with the required church permissions must handle this request."
    );
}
async function reviewAvailable(tx: Tx, claim: ChurchClaim) {
  const operators = await tx.platformOperatorGrant.count({
    where: {
      userId: { not: claim.ownerId },
      capability: "REVIEW_CHURCH_CLAIMS",
      revokedAt: null,
      user: eligibleWhere
    }
  });
  if (operators) return;
  if (claim.kind === "ACCESS" && claim.churchId) {
    const managers = await tx.churchCapabilityGrant.findMany({
      where: {
        churchId: claim.churchId,
        capability: "MANAGE_CHURCH_ACCESS",
        revokedAt: null,
        user: eligibleWhere
      },
      select: { userId: true }
    });
    for (const manager of managers)
      if (await canReview(tx, manager.userId, claim)) return;
  }
  throw new PortalError(
    503,
    "An independent reviewer is not available for this request yet. Your private draft is saved."
  );
}
async function managementVersion(tx: Tx, claim: ChurchClaim) {
  if (!claim.churchId) return;
  const church = await tx.church.findUniqueOrThrow({
    where: { id: claim.churchId },
    select: { managementVersion: true }
  });
  expected(claim.baseManagementVersion, church.managementVersion);
}
async function currentOwner(tx: Tx, claim: ChurchClaim) {
  const user = await tx.platformUser.findUniqueOrThrow({
    where: { id: claim.ownerId },
    select: {
      id: true,
      name: true,
      username: true,
      suspendedAt: true,
      deactivatedAt: true,
      emailVerifiedAt: true,
      adultAcknowledgedAt: true,
      adultPolicyVersion: true,
      portalVersion: true,
      credentialVersion: true
    }
  });
  eligibility(user);
  expected(claim.credentialVersion, user.credentialVersion);
  return user;
}
async function record(
  tx: Tx,
  claim: ChurchClaim,
  actorId: string,
  action: string,
  reason: string,
  evidence: Prisma.InputJsonValue = {}
) {
  await tx.churchClaimDecision.create({
    data: {
      claimId: claim.id,
      actorId,
      action,
      reason,
      evidence,
      version: claim.version
    }
  });
}
const ownSelect = {
  id: true,
  ownerId: true,
  churchId: true,
  kind: true,
  authority: true,
  profile: true,
  preparation: true,
  scopes: true,
  status: true,
  version: true,
  baseChurchVersion: true,
  reviewReason: true,
  submittedAt: true,
  approvedAt: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true
} as const;
export async function getChurchClaims(
  db: PrismaClient,
  token: unknown,
  options: {
    id?: string;
    review?: boolean;
    churchId?: string;
    cursor?: string;
  } = {}
) {
  return portal(db, token, async (tx, actor) => {
    const operator = await isOperator(tx, actor.id);
    const grants = await activeGrants(tx, actor.id);
    const managed = grants
      .filter((row) => row.capability === "MANAGE_CHURCH_ACCESS")
      .map((row) => row.church);
    let selected: ChurchClaim | null = null;
    if (options.id) {
      selected = await tx.churchClaim.findUnique({ where: { id: options.id } });
      if (!selected || (!options.review && selected.ownerId !== actor.id))
        throw new PortalError(404, "This setup draft is not available.");
      if (options.review) {
        await requireReview(tx, actor.id, selected);
        if (
          !selected.submittedAt ||
          ["DRAFT", "WITHDRAWN"].includes(selected.status)
        )
          throw new PortalError(
            404,
            "This request is not available for review."
          );
      }
    } else if (
      options.review &&
      !operator &&
      (!options.churchId || !managed.some((row) => row.id === options.churchId))
    ) {
      if (!managed.length)
        throw new PortalError(403, "Church review permission is required.");
    }
    const queueReady =
      !options.review ||
      operator ||
      !!(
        options.churchId && managed.some((row) => row.id === options.churchId)
      );
    const rows = selected
      ? [selected]
      : queueReady
        ? await tx.churchClaim.findMany({
            where: options.review
              ? {
                  submittedAt: { not: null },
                  status: { notIn: ["DRAFT", "WITHDRAWN"] },
                  ownerId: { not: actor.id },
                  ...(options.churchId ? { churchId: options.churchId } : {}),
                  ...(!operator
                    ? {
                        kind: "ACCESS",
                        NOT: {
                          scopes: {
                            hasSome: Object.keys(claimScopes).filter(
                              (scope) =>
                                !grants.some(
                                  (grant) =>
                                    grant.churchId === options.churchId &&
                                    grant.capability === scope
                                )
                            ) as ClaimScope[]
                          }
                        }
                      }
                    : {})
                }
              : { ownerId: actor.id },
            select: ownSelect,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 101,
            ...(options.cursor
              ? { cursor: { id: options.cursor }, skip: 1 }
              : {})
          })
        : [];
    const visible = [];
    for (const row of rows.slice(0, 100)) {
      if (options.review && !selected) {
        if (row.ownerId === actor.id) continue;
        if (!operator) {
          const held = grants
            .filter((grant) => grant.churchId === row.churchId)
            .map((grant) => grant.capability);
          if (
            row.kind !== "ACCESS" ||
            !held.includes("MANAGE_CHURCH_ACCESS") ||
            !row.scopes.every((scope) => held.includes(scope))
          )
            continue;
        }
      }
      // Always explicitly select fields, including when the selected row came from a private authorization read.
      visible.push({
        id: row.id,
        churchId: row.churchId,
        kind: row.kind,
        authority: projectClaimAuthority(selected ? row.authority : {}),
        profile: projectListingData(row.profile),
        preparation: selected && !options.review ? row.preparation : "",
        scopes: row.scopes,
        status: row.status,
        version: row.version,
        baseChurchVersion: row.baseChurchVersion,
        reviewReason: row.reviewReason,
        activatedAt: row.activatedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString()
      });
    }
    const history = selected
      ? await tx.churchClaimDecision.findMany({
          where: { claimId: selected.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 100,
          select: {
            action: true,
            reason: true,
            version: true,
            createdAt: true,
            ...(options.review ? { evidence: true, actorId: true } : {})
          }
        })
      : [];
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
      claims: visible,
      review: !!options.review,
      operator,
      managed,
      reviewEnabled: claimReviewEnabled(),
      moreCursor: rows.length > 100 ? rows[99].id : undefined,
      canonical: selected?.churchId
        ? await tx.church.findUnique({
            where: { id: selected.churchId },
            select: churchSelect
          })
        : null,
      currentScopes: selected?.churchId
        ? grants
            .filter((row) => row.churchId === selected.churchId)
            .map((row) => row.capability)
        : [],
      canManageProfile:
        !!selected?.churchId &&
        grants.some(
          (row) =>
            row.churchId === selected.churchId &&
            row.capability === "MANAGE_CHURCH_PROFILE"
        ),
      matches:
        selected && !selected.churchId
          ? (await likelyChurchMatches(tx, selected.profile)).slice(0, 20)
          : [],
      claimant:
        options.review && selected
          ? await tx.platformUser.findUnique({
              where: { id: selected.ownerId },
              select: { name: true, username: true, email: true }
            })
          : null,
      history: history.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString()
      }))
    };
  });
}
export async function churchClaimCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  return portal(db, token, async (tx, actor) => {
    eligibility(actor);
    if (input.operation === "create") {
      const requestKey = string(input.requestKey);
      const churchId = input.churchId ? string(input.churchId) : null;
      const prior = await tx.churchClaim.findUnique({
        where: { ownerId_requestKey: { ownerId: actor.id, requestKey } }
      });
      if (prior) {
        const creation = await tx.churchClaimDecision.findFirst({
          where: { claimId: prior.id, action: "CREATE" },
          orderBy: { createdAt: "asc" },
          select: { evidence: true }
        });
        const initial = creation?.evidence as
          | { churchId?: string | null }
          | undefined;
        if (
          (initial && Object.hasOwn(initial, "churchId")
            ? initial.churchId
            : prior.churchId) !== churchId
        )
          throw new PortalError(
            409,
            "This request key already belongs to another setup draft."
          );
        return { id: prior.id, message: "Your private setup draft is saved." };
      }
      const church = churchId
        ? await tx.church.findUnique({ where: { id: churchId } })
        : null;
      if (churchId && !church) throw new PortalError(404, "Church not found.");
      if (
        (await tx.churchClaim.count({
          where: {
            ownerId: actor.id,
            createdAt: { gte: new Date(Date.now() - 86400000) }
          }
        })) >= 5
      )
        throw new PortalError(
          429,
          "You have reached today's setup draft limit."
        );
      const managed =
        church &&
        (await verifiedChurchManagement(tx, [church.id])).has(church.id);
      const claim = await tx.churchClaim.create({
        data: {
          ownerId: actor.id,
          requestKey,
          churchId,
          kind: managed ? "ACCESS" : "INITIAL",
          authority: projectClaimAuthority({}),
          profile: projectListingData(church),
          baseChurchVersion: church?.version,
          baseManagementVersion: church?.managementVersion ?? 0
        }
      });
      await record(
        tx,
        claim,
        actor.id,
        "CREATE",
        "Private church setup started.",
        { churchId }
      );
      return {
        id: claim.id,
        message: "Private setup started. No church permissions were granted."
      };
    }
    const claim = await tx.churchClaim.findUnique({
      where: { id: string(input.id) }
    });
    if (!claim)
      throw new PortalError(404, "This setup draft is not available.");
    const reviewing =
      input.operation === "review" ||
      (input.operation === "revoke" && claim.ownerId !== actor.id);
    if (reviewing) {
      await requireReview(tx, actor.id, claim);
      if (!claim.submittedAt || ["DRAFT", "WITHDRAWN"].includes(claim.status))
        throw new PortalError(404, "This request is not available for review.");
    } else if (claim.ownerId !== actor.id)
      throw new PortalError(404, "This setup draft is not available.");
    expected(input.expectedVersion, claim.version);
    const changed = { version: { increment: 1 } };
    if (input.operation === "save") {
      if (!["DRAFT", "NEEDS_INFORMATION", "REJECTED"].includes(claim.status))
        throw new PortalError(
          409,
          "Withdraw a pending request before changing its reviewed details. Approved details cannot be changed through this draft."
        );
      const authority = authorityData(input.authority);
      const profile = listingData(input.profile, false);
      const scopes = scopesData(input.scopes);
      const church = claim.churchId
        ? await tx.church.findUniqueOrThrow({ where: { id: claim.churchId } })
        : null;
      if (church) expected(input.expectedChurchVersion, church.version);
      const managed =
        church &&
        (await verifiedChurchManagement(tx, [church.id])).has(church.id);
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: {
          ...changed,
          authority,
          profile,
          scopes,
          status: "DRAFT",
          kind:
            input.dispute === true ? "DISPUTE" : managed ? "ACCESS" : "INITIAL",
          baseChurchVersion: church?.version,
          baseManagementVersion: church?.managementVersion ?? 0,
          approvedBy: null,
          approvedAt: null,
          policyVersion: null
        }
      });
      return {
        id: claim.id,
        message:
          "Private authority and public profile drafts saved. Nothing has been published."
      };
    }
    if (input.operation === "prepare") {
      if (["WITHDRAWN", "REVOKED"].includes(claim.status))
        throw new PortalError(409, "This setup request has ended.");
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: { ...changed, preparation: string(input.preparation, 5000, 0) }
      });
      return {
        id: claim.id,
        message:
          "Private preparation notes saved. They do not appoint anyone or publish anything."
      };
    }
    if (
      input.operation === "profile-save" ||
      input.operation === "profile-publish"
    ) {
      if (
        claim.status !== "APPROVED" ||
        !claim.activatedAt ||
        !claim.churchId ||
        !(await activeGrants(tx, actor.id, claim.churchId)).some(
          (row) => row.capability === "MANAGE_CHURCH_PROFILE"
        )
      )
        throw new PortalError(
          403,
          "Active permission to manage this church profile is required."
        );
      const church = await tx.church.findUniqueOrThrow({
        where: { id: claim.churchId }
      });
      if (input.operation === "profile-save") {
        expected(input.expectedChurchVersion, church.version);
        await tx.churchClaim.update({
          where: { id: claim.id },
          data: {
            ...changed,
            profile: listingData(input.profile, false),
            baseChurchVersion: church.version
          }
        });
        return {
          id: claim.id,
          message:
            "Private profile changes saved. Preview them before publishing."
        };
      }
      expected(claim.baseChurchVersion, church.version);
      if (input.publicConfirmed !== true)
        throw new PortalError(
          400,
          "Confirm the public profile preview before publishing."
        );
      const churchUpdated = await tx.church.update({
        where: { id: church.id },
        data: { ...listingData(claim.profile, true), version: { increment: 1 } }
      });
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: { ...changed, baseChurchVersion: churchUpdated.version }
      });
      await record(
        tx,
        claim,
        actor.id,
        "PUBLISH_PROFILE",
        "Public church profile updated by an authorized representative."
      );
      return {
        id: claim.id,
        message: "Church profile published on the same church page."
      };
    }
    if (input.operation === "submit") {
      enabled();
      if (claim.status !== "DRAFT")
        throw new PortalError(
          409,
          "Save a current draft before submitting it."
        );
      authorityData(claim.authority, true);
      listingData(claim.profile, true);
      if (
        !claim.scopes.length ||
        input.contactConsent !== true ||
        input.searchedConfirmed !== true
      )
        throw new PortalError(
          400,
          "Select the needed permissions, confirm the church search and consent to private contact for this review."
        );
      await managementVersion(tx, claim);
      await reviewAvailable(tx, claim);
      if (
        (await tx.churchClaim.count({
          where: {
            ownerId: actor.id,
            submittedAt: { gte: new Date(Date.now() - 86400000) }
          }
        })) >= 3
      )
        throw new PortalError(
          429,
          "You have reached today's review submission limit."
        );
      const user = await tx.platformUser.findUniqueOrThrow({
        where: { id: actor.id },
        select: { credentialVersion: true }
      });
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: {
          ...changed,
          status: "SUBMITTED",
          credentialVersion: user.credentialVersion,
          submittedAt: new Date(),
          reviewReason: ""
        }
      });
      await record(
        tx,
        claim,
        actor.id,
        "SUBMIT",
        "Claim-specific private contact consent recorded.",
        {
          authority: projectClaimAuthority(claim.authority),
          profile: projectListingData(claim.profile),
          scopes: claim.scopes
        }
      );
      return {
        id: claim.id,
        message:
          "Request submitted for independent review. No church permissions are active yet."
      };
    }
    if (input.operation === "review") {
      enabled();
      if (claim.status !== "SUBMITTED")
        throw new PortalError(
          409,
          "This request is no longer awaiting a decision."
        );
      const action = string(input.action, 30);
      if (!["APPROVE", "NEEDS_INFORMATION", "REJECT"].includes(action))
        throw new PortalError(400, "Choose a review decision.");
      const reason = string(input.reason, 1000);
      let evidence: Prisma.InputJsonValue = {};
      if (action === "APPROVE") {
        await currentOwner(tx, claim);
        await managementVersion(tx, claim);
        const source = string(input.trustedSource, 1000);
        const person = string(input.confirmingPerson, 300);
        const checkedAt = string(input.checkedAt, 10);
        const date = new Date(checkedAt + "T00:00:00Z");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(checkedAt) ||
          !Number.isFinite(+date) ||
          date.toISOString().slice(0, 10) !== checkedAt ||
          +date > Date.now() ||
          +date < Date.now() - 90 * 86400000
        )
          throw new PortalError(
            400,
            "Enter the independent check date within the last 90 days."
          );
        if (
          input.independentConfirmed !== true ||
          input.scopeConfirmed !== true ||
          (!claim.churchId && input.distinctConfirmed !== true)
        )
          throw new PortalError(
            400,
            "Confirm independent authority, exact permissions and any new church identity before approval."
          );
        evidence = {
          trustedSource: source,
          confirmingPerson: person,
          checkedAt,
          scopes: claim.scopes,
          policy: CLAIM_POLICY,
          matchedIds: claim.churchId
            ? []
            : (await likelyChurchMatches(tx, claim.profile)).map(
                (row) => row.id
              )
        };
      }
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: {
          ...changed,
          status:
            action === "APPROVE"
              ? "APPROVED"
              : action === "REJECT"
                ? "REJECTED"
                : "NEEDS_INFORMATION",
          reviewReason: reason,
          approvedBy: action === "APPROVE" ? actor.id : null,
          approvedAt: action === "APPROVE" ? new Date() : null,
          policyVersion: action === "APPROVE" ? CLAIM_POLICY : null
        }
      });
      await record(tx, claim, actor.id, action, reason, evidence);
      return {
        id: claim.id,
        message:
          action === "APPROVE"
            ? "Approved permissions are ready for the representative's explicit activation."
            : "Decision saved for the representative."
      };
    }
    if (input.operation === "activate") {
      enabled();
      if (
        claim.status !== "APPROVED" ||
        claim.activatedAt ||
        claim.policyVersion !== CLAIM_POLICY ||
        !claim.approvedBy ||
        !claim.approvedAt
      )
        throw new PortalError(409, "This request is not awaiting activation.");
      if (+claim.approvedAt < Date.now() - 30 * 86400000)
        throw new PortalError(
          409,
          "This approval has expired. Start a new review request."
        );
      await currentOwner(tx, claim);
      await managementVersion(tx, claim);
      await requireReview(tx, claim.approvedBy, claim);
      if (
        input.accessConfirmed !== true ||
        (!claim.churchId && input.publicConfirmed !== true)
      )
        throw new PortalError(
          400,
          "Confirm the approved connection and permissions, and the new public profile when needed."
        );
      const active = await tx.churchConnection.findFirst({
        where: { userId: actor.id, state: { in: ["PENDING", "APPROVED"] } }
      });
      if (active && active.churchId !== claim.churchId)
        throw new PortalError(
          409,
          "You already have a pending request or Home Church elsewhere. Withdraw or leave it yourself before activating; nothing will be transferred automatically."
        );
      const data = listingData(claim.profile, true);
      let church = claim.churchId
        ? await tx.church.findUniqueOrThrow({ where: { id: claim.churchId } })
        : null;
      if (!church) {
        // A similar listing appearing after review requires a fresh identity check.
        const approval = await tx.churchClaimDecision.findFirst({
          where: { claimId: claim.id, action: "APPROVE" },
          orderBy: { createdAt: "desc" },
          select: { evidence: true }
        });
        const evidence = approval?.evidence as
          | { matchedIds?: string[] }
          | undefined;
        if (
          (await likelyChurchMatches(tx, data)).some(
            (row) => !evidence?.matchedIds?.includes(row.id)
          )
        )
          throw new PortalError(
            409,
            "A possible matching church now exists. Start a request for that record or obtain a fresh distinct-church review."
          );
        church = await tx.church.create({
          data: { ...data, slug: "church-" + randomUUID() }
        });
      } else if (input.publicConfirmed === true) {
        expected(claim.baseChurchVersion, church.version);
        await tx.church.update({
          where: { id: church.id },
          data: { ...data, version: { increment: 1 } }
        });
      }
      const priorConnection = await tx.churchConnection.findUnique({
        where: { userId_churchId: { userId: actor.id, churchId: church.id } }
      });
      if (priorConnection && priorConnection.state !== "APPROVED") {
        await tx.churchDirectoryPreference.deleteMany({
          where: { connectionId: priorConnection.id }
        });
        await tx.churchContactAssignment.updateMany({
          where: { connectionId: priorConnection.id, revokedAt: null },
          data: { revokedAt: new Date(), version: { increment: 1 } }
        });
      }
      const connection = priorConnection
        ? await tx.churchConnection.update({
            where: { id: priorConnection.id },
            data: { state: "APPROVED", version: { increment: 1 } }
          })
        : await tx.churchConnection.create({
            data: { userId: actor.id, churchId: church.id, state: "APPROVED" }
          });
      for (const capability of claim.scopes) {
        const key = { userId: actor.id, churchId: church.id, capability };
        const prior = await tx.churchCapabilityGrant.findUnique({
          where: { userId_churchId_capability: key }
        });
        if (prior && !prior.revokedAt)
          throw new PortalError(
            409,
            "One requested permission is already assigned. Start a request for only the additional permissions needed."
          );
        const grantData = {
          ...key,
          dependencyConnectionId: connection.id,
          sourceClaimId: claim.id,
          revokedAt: null
        };
        if (prior)
          await tx.churchCapabilityGrant.update({
            where: { id: prior.id },
            data: { ...grantData, version: { increment: 1 } }
          });
        else await tx.churchCapabilityGrant.create({ data: grantData });
      }
      const activatedChurch = await tx.church.update({
        where: { id: church.id },
        data: { managementVersion: { increment: 1 } }
      });
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: {
          ...changed,
          churchId: church.id,
          baseChurchVersion: activatedChurch.version,
          activatedAt: new Date()
        }
      });
      await record(
        tx,
        claim,
        actor.id,
        "ACTIVATE",
        input.publicConfirmed === true
          ? "Approved permissions activated with explicit public profile confirmation."
          : "Approved permissions activated; existing public profile preserved."
      );
      return {
        id: claim.id,
        churchId: church.id,
        message:
          "Approved church permissions are active. Directory sharing remains your separate choice."
      };
    }
    if (input.operation === "withdraw" || input.operation === "revoke") {
      const activated = !!claim.activatedAt;
      if (["WITHDRAWN", "REVOKED"].includes(claim.status))
        throw new PortalError(409, "This request has already ended.");
      if (input.operation === "withdraw" && activated)
        throw new PortalError(
          409,
          "Use End approved access for an activated request."
        );
      const reason = string(input.reason, 1000);
      await tx.churchCapabilityGrant.updateMany({
        where: { sourceClaimId: claim.id, revokedAt: null },
        data: { revokedAt: new Date(), version: { increment: 1 } }
      });
      if (activated && claim.churchId)
        await tx.church.update({
          where: { id: claim.churchId },
          data: { managementVersion: { increment: 1 } }
        });
      await tx.churchClaim.update({
        where: { id: claim.id },
        data: {
          ...changed,
          status: input.operation === "revoke" ? "REVOKED" : "WITHDRAWN",
          reviewReason: reason
        }
      });
      await record(tx, claim, actor.id, input.operation.toUpperCase(), reason);
      return {
        id: claim.id,
        message:
          "Request ended. Permissions from this request are no longer active; unrelated grants and public church information are preserved."
      };
    }
    throw new PortalError(400, "Choose a supported setup action.");
  });
}
