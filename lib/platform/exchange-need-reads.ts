import type { ExchangeNeedContribution, PrismaClient } from "@prisma/client";
import { withAccountRead } from "./account-read";
import {
  exchangeAuthority,
  exchangeCanManage,
  exchangeReadableWhere
} from "./exchange-policy";
import {
  managedNeedListing,
  needCoordinatorCurrent,
  needPair,
  needSource,
  requireNeedCoordinator,
  unavailableNeed
} from "./exchange-need-policy";
import { needProgress, NEED_PAGE } from "./exchange-need-options";
import { postContext, postReadableWhere, type PostTx } from "./post-access";
import { postId } from "./post-input";
import {
  canOrganize,
  participationActive,
  participationInclude,
  participationPost
} from "./post-participation";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";
import { socialUserWhere } from "./social-policy";
import { PortalError } from "./portal-policy";
import { volunteerShift } from "./volunteer-shift";
import { reviewedVolunteerApplication } from "./volunteer-policy";
import {
  needContributionReadSources,
  type NeedContributionReadSource
} from "./exchange-need-read-access";

function contributionView(
  row: ExchangeNeedContribution,
  ownerId: string,
  source?: NeedContributionReadSource
) {
  const current = !!source;
  const own = row.contributorId === ownerId;
  if (!own && !current) return null;
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    quantity: row.quantity,
    received: row.received,
    returned: row.returned,
    createdAt: row.createdAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    current,
    own,
    needId: current ? row.needId : null,
    slotId: current ? row.slotId : null,
    listingId: current ? source!.need.listingId : null,
    title: current ? source!.need.listing!.title : "Unavailable need",
    note: current ? row.note : "",
    quoteMinor: current ? row.quoteMinor : null,
    quoteCurrency: current ? row.quoteCurrency : null,
    shareName: current && row.shareName,
    disputed: !!row.disputedAt,
    disputeNote: current ? row.disputeNote : "",
    loanReturnAt: row.loanReturnAt?.toISOString() ?? null,
    loanResponsibility: current ? row.loanResponsibility : "",
    contributor:
      !own && current && row.contributorId
        ? { name: source!.contributorName }
        : null
  };
}
async function contributionViews(
  tx: PostTx,
  rows: ExchangeNeedContribution[],
  ownerId: string
) {
  const sources = await needContributionReadSources(tx, rows);
  return rows
    .map((row) => contributionView(row, ownerId, sources.get(row.id)))
    .filter((row) => row !== null);
}
export async function readExchangeNeeds(
  db: PrismaClient,
  token: unknown,
  query: { view: string; id?: unknown; listingId?: unknown; after?: unknown }
) {
  return withAccountRead(db, token, async (tx, ownerId) => {
    const context = await postContext(tx, ownerId);
    const after = query.after ? postId(query.after) : undefined;
    if (query.view === "volunteers") {
      if (!ownerId) throw unavailableNeed();
      const slot = await tx.exchangeNeedSlot.findUnique({
        where: { id: postId(query.id) },
        include: { need: true, volunteerSlot: { include: { opportunity: true } } }
      });
      if (!slot?.volunteerSlot || slot.volunteerSlot.opportunity?.recoveryRequired) throw unavailableNeed();
      const approvalRequired = !!slot.volunteerSlot.opportunity;
      await requireNeedCoordinator(tx, slot.need, ownerId);
      const post = await participationPost(
        tx,
        context,
        slot.volunteerSlot.postId
      );
      if (!canOrganize(context, post)) throw unavailableNeed();
      const rows = await tx.postVolunteerSignup.findMany({
        where: {
          slotId: slot.volunteerSlot.id,
          ...(after ? { id: { gt: after } } : {})
        },
        select: {
          id: true,
          version: true,
          state: true,
          completedAt: true,
          application: { select: { id: true } },
          user: {
            select: {
              id: true,
              name: true,
              suspendedAt: true,
              deactivatedAt: true,
              erasedAt: true
            }
          }
        },
        orderBy: { id: "asc" },
        take: NEED_PAGE + 1
      });
      const currentApplicants = new Set<string>();
      if (approvalRequired) for (const row of rows.slice(0, NEED_PAGE)) {
        if (!row.application) continue;
        try { await reviewedVolunteerApplication(tx, context, row.application.id); currentApplicants.add(row.id); }
        catch (error) { if (!(error instanceof PortalError && error.status === 404)) throw error; }
      }
      return {
        ownerId,
        volunteerNeedId: slot.needId,
        volunteerRole: slot.volunteerSlot.role,
        volunteers: rows.slice(0, NEED_PAGE).map((r) => ({
          id: r.id,
          version: r.version,
          state: r.state,
          completedAt: r.completedAt?.toISOString() ?? null,
          name:
            (approvalRequired && !currentApplicants.has(r.id)) ||
            r.user.erasedAt ||
            r.user.suspendedAt ||
            r.user.deactivatedAt ||
            context.blockedIds?.includes(r.user.id)
              ? "Unavailable account"
              : r.user.name
        })),
        next: rows.length > NEED_PAGE ? rows[NEED_PAGE - 1].id : null
      };
    }
    if (query.view === "roles" || query.view === "posts") {
      if (!ownerId) throw unavailableNeed();
      const { listing } = await managedNeedListing(
        tx,
        ownerId,
        query.listingId ?? query.id
      );
      if (query.view === "roles") {
        if (!context.volunteers.has(listing.ownerChurchId!))
          return { ownerId, roles: [], next: null };
        const rows = await tx.postVolunteerSlot.findMany({
          where: {
            closedAt: null,
            AND: [{ OR: [{ opportunity: null }, { opportunity: { recoveryRequired: false } }] }],
            OR: [
              { exchangeNeedSlot: null },
              { exchangeNeedSlot: { needId: listing.id } }
            ],
            post: {
              AND: [
                postReadableWhere(context),
                {
                  authorChurchId: listing.ownerChurchId,
                  eventOccurrence: {
                    canceledAt: null,
                    endAt: { gt: new Date() },
                    event: { canceledAt: null }
                  }
                }
              ]
            },
            ...(after ? { id: { gt: after } } : {})
          },
          select: {
            id: true,
            role: true,
            opportunity: { select: { id: true } },
            shiftStartAt: true,
            capacity: true,
            postId: true,
            post: {
              select: {
                eventOccurrence: { select: { title: true, startAt: true } }
              }
            }
          },
          orderBy: { id: "asc" },
          take: NEED_PAGE + 1
        });
        return {
          ownerId,
          roles: rows.slice(0, NEED_PAGE).map((r) => ({
            id: r.id,
            role: r.role,
            approvalRequired: !!r.opportunity,
            capacity: r.capacity,
            postId: r.postId,
            eventTitle: r.post.eventOccurrence!.title,
            startAt: (r.shiftStartAt ?? r.post.eventOccurrence!.startAt).toISOString()
          })),
          next: rows.length > NEED_PAGE ? rows[NEED_PAGE - 1].id : null
        };
      }
      if (!context.publishers.has(listing.ownerChurchId!))
        return { ownerId, posts: [], next: null };
      const rows = await tx.platformPost.findMany({
        where: {
          AND: [
            postReadableWhere(context),
            {
              authorChurchId: listing.ownerChurchId,
              type: "NEED",
              OR: [{ exchangeNeedId: null }, { exchangeNeedId: listing.id }],
              ...(after ? { id: { gt: after } } : {})
            }
          ]
        },
        select: {
          id: true,
          version: true,
          content: true,
          exchangeNeedId: true
        },
        orderBy: { id: "asc" },
        take: NEED_PAGE + 1
      });
      return {
        ownerId,
        posts: rows.slice(0, NEED_PAGE).map((p) => ({
          id: p.id,
          version: p.version,
          excerpt: p.content.slice(0, 180),
          linked: !!p.exchangeNeedId
        })),
        next: rows.length > NEED_PAGE ? rows[NEED_PAGE - 1].id : null
      };
    }
    if (query.view === "mine" || query.view === "contribution") {
      if (!ownerId || !context.eligible) throw unavailableNeed();
      const rows = await tx.exchangeNeedContribution.findMany({
        where: {
          contributorId: ownerId,
          need: { recoveryRequired: false },
          ...(query.view === "contribution"
            ? { id: postId(query.id) }
            : after
              ? { id: { lt: after } }
              : {})
        },
        orderBy: { id: "desc" },
        take: NEED_PAGE + 1
      });
      if (query.view === "contribution" && !rows.length)
        throw unavailableNeed();
      return {
        ownerId,
        contributions: await contributionViews(
          tx,
          rows.slice(0, NEED_PAGE),
          ownerId
        ),
        next: rows.length > NEED_PAGE ? rows[NEED_PAGE - 1].id : null
      };
    }
    if (query.view === "contributors") {
      if (!ownerId) throw unavailableNeed();
      const need = await tx.exchangeNeed.findUnique({
        where: { id: postId(query.id) }
      });
      if (!need || need.recoveryRequired) throw unavailableNeed();
      await requireNeedCoordinator(tx, need, ownerId);
      const rows = await tx.exchangeNeedContribution.findMany({
        where: { needId: need.id, ...(after ? { id: { lt: after } } : {}) },
        orderBy: { id: "desc" },
        take: NEED_PAGE + 1
      });
      return {
        ownerId,
        contributions: await contributionViews(
          tx,
          rows.slice(0, NEED_PAGE),
          ownerId
        ),
        next: rows.length > NEED_PAGE ? rows[NEED_PAGE - 1].id : null
      };
    }
    if (query.view !== "need")
      throw new PortalError(400, "Choose a supported need view.");
    const listing = await tx.exchangeListing.findUnique({
      where: { id: postId(query.listingId ?? query.id) }
    });
    if (!listing || listing.intent !== "CHURCH_NEED" || !listing.ownerChurchId)
      throw unavailableNeed();
    const authority = await exchangeAuthority(tx, context);
    const canManage = exchangeCanManage(context, authority, listing);
    const need = await tx.exchangeNeed.findUnique({
      where: { listingId: listing.id }
    });
    // Even an unconfigured CHURCH_NEED must pass its existing listing audience.
    const source = need ? await needSource(tx, need.id, context) : null;
    if (!canManage && !source) {
      if (
        need ||
        !(await tx.exchangeListing.findFirst({
          where: { AND: [{ id: listing.id }, exchangeReadableWhere(context)] },
          select: { id: true }
        }))
      )
        throw unavailableNeed();
    }
    const base = {
      ownerId,
      listingId: listing.id,
      listingVersion: listing.version,
      listingState: listing.state,
      title: listing.title,
      canManage:
        canManage && authority.managers.includes(listing.ownerChurchId),
      canCoordinate: false,
      need: null as null | Awaited<ReturnType<typeof details>>
    };
    if (!need) return base;
    if (need.recoveryRequired) throw unavailableNeed();
    const coordinatorCurrent = await needCoordinatorCurrent(tx, need);
    const canCoordinate =
      coordinatorCurrent &&
      need.coordinatorId === ownerId &&
      (await privilegedProjectionAvailable(tx, ownerId!));
    async function details() {
      const slots = await tx.exchangeNeedSlot.findMany({
        where: { needId: need!.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 13
      });
      if (slots.length > 12)
        throw new PortalError(503, "This need requires a slot size review.");
      const groups = await tx.exchangeNeedContribution.groupBy({
        by: ["slotId", "state"],
        where: { needId: need!.id },
        _sum: { quantity: true, received: true, returned: true }
      });
      const roles = await tx.postVolunteerSlot.findMany({
        where: {
          id: {
            in: slots.flatMap((s) =>
              s.volunteerSlotId ? [s.volunteerSlotId] : []
            )
          }
        },
        include: {
          opportunity: { select: { id: true, recoveryRequired: true } },
          post: { include: participationInclude },
          _count: {
            select: {
              signups: {
                where: {
                  OR: [{ state: "ACTIVE" }, { completedAt: { not: null } }]
                }
              }
            }
          },
          signups: {
            where: { userId: ownerId ?? "" },
            select: { id: true, version: true, state: true, completedAt: true }
          }
        }
      });
      const visiblePosts = new Set(
        (
          await tx.platformPost.findMany({
            where: {
              AND: [
                { id: { in: roles.map((r) => r.postId) } },
                postReadableWhere(context)
              ]
            },
            select: { id: true }
          })
        ).map((p) => p.id)
      );
      const finished = await tx.postVolunteerSignup.groupBy({
        by: ["slotId"],
        where: {
          slotId: { in: roles.map((r) => r.id) },
          completedAt: { not: null }
        },
        _count: true
      });
      const mine = ownerId
        ? await tx.exchangeNeedContribution.findMany({
            where: { needId: need!.id, contributorId: ownerId },
            orderBy: { id: "desc" },
            take: NEED_PAGE + 1
          })
        : [];
      const publicPeople = await tx.exchangeNeedContribution.findMany({
        where: {
          needId: need!.id,
          shareName: true,
          state: "COMMITTED",
          authorityKey: { not: null },
          contributor: socialUserWhere(context)
        },
        orderBy: { id: "asc" },
        take: NEED_PAGE
      });
      const names = [];
      const namedSources = await needContributionReadSources(tx, publicPeople);
      for (const person of publicPeople) {
        const source = namedSources.get(person.id);
        if (source)
          names.push({ name: source.contributorName, slotId: person.slotId });
      }
      const pair =
        ownerId && coordinatorCurrent && ownerId !== need!.coordinatorId
          ? await needPair(tx, need!.id, ownerId)
          : null;
      const open =
        !!source &&
        source.listing!.state === "ACTIVE" &&
        !need!.closedAt &&
        !need!.canceledAt &&
        !!need!.deadlineAt &&
        need!.deadlineAt > new Date();
      const updates = await tx.exchangeNeedEvent.findMany({
        where: {
          needId: need!.id,
          action: {
            in: [
              "UPDATE",
              "DEADLINE",
              "DEADLINE_REACHED",
              "CLOSED_NEED",
              "CANCELED_NEED"
            ]
          },
          ...(after ? { id: { lt: after } } : {})
        },
        orderBy: { id: "desc" },
        take: NEED_PAGE + 1
      });
      return {
        id: need!.id,
        version: need!.version,
        consentVersion: need!.consentVersion,
        coordinatorCurrent,
        deadlineLocal: need!.deadlineLocal,
        timeZone: need!.timeZone,
        deadlineAt: need!.deadlineAt?.toISOString() ?? null,
        closed: !!need!.closedAt,
        canceled: !!need!.canceledAt,
        closeReason: need!.closeReason,
        open,
        canContribute: !!pair && open,
        slots: slots.map((slot) => {
          const sums = groups
            .filter((g) => g.slotId === slot.id)
            .reduce(
              (v, g) => ({
                committed:
                  v.committed +
                  (g.state === "COMMITTED" && coordinatorCurrent
                    ? (g._sum.quantity ?? 0)
                    : (g._sum.received ?? 0)),
                received: v.received + (g._sum.received ?? 0),
                returned: v.returned + (g._sum.returned ?? 0)
              }),
              { committed: 0, received: 0, returned: 0 }
            );
          const role = roles.find((r) => r.id === slot.volunteerSlotId);
          const visibleRole =
            role && !role.opportunity?.recoveryRequired && visiblePosts.has(role.postId) ? role : null;
          const time = visibleRole?.post.eventOccurrence ? volunteerShift(visibleRole, visibleRole.post.eventOccurrence) : null;
          const committed =
            slot.action === "VOLUNTEER"
              ? (visibleRole?._count.signups ?? null)
              : sums.committed;
          const received =
            slot.action === "VOLUNTEER"
              ? visibleRole
                ? (finished.find((f) => f.slotId === role!.id)?._count ?? 0)
                : null
              : sums.received;
          const target = visibleRole?.capacity ?? slot.target;
          return {
            id: slot.id,
            version: slot.version,
            action: slot.action,
            label: slot.label,
            unit: slot.unit,
            target,
            committed,
            received,
            returned: sums.returned,
            status:
              committed === null || received === null
                ? "Event role unavailable"
                : needProgress(
                    target,
                    committed,
                    received,
                    !!slot.closedAt || !open
                  ),
            closed: !!slot.closedAt,
            closeReason: slot.closeReason,
            loan: slot.loan,
            returnAt: slot.returnAt?.toISOString() ?? null,
            returnLocal: slot.returnLocal,
            returnTimeZone: slot.returnTimeZone,
            returnResponsibility: slot.returnResponsibility,
            volunteer: visibleRole
              ? {
                  id: visibleRole.id,
                  postId: visibleRole.postId,
                  role: visibleRole.role,
                  opportunityId: visibleRole.opportunity?.id ?? null,
                  approvalRequired: !!visibleRole.opportunity,
                  open:
                    !visibleRole.closedAt &&
                    !time?.conflict && (!time || time.endAt > new Date()) &&
                    participationActive(visibleRole.post) &&
                    open &&
                    !slot.closedAt,
                  signup: visibleRole.signups[0]
                    ? {
                        ...visibleRole.signups[0],
                        completedAt:
                          visibleRole.signups[0].completedAt?.toISOString() ??
                          null
                      }
                    : null,
                  event: visibleRole.post.eventOccurrence
                    ? {
                        title: visibleRole.post.eventOccurrence.title,
                        startAt:
                          time!.startAt.toISOString(),
                        endAt:
                          time!.endAt.toISOString(),
                        timeZone: visibleRole.post.eventOccurrence.timeZone,
                        canceled:
                          !!visibleRole.post.eventOccurrence.canceledAt ||
                          !!visibleRole.post.eventOccurrence.event.canceledAt
                      }
                    : null
                }
              : null
          };
        }),
        contributions: ownerId
          ? await contributionViews(tx, mine.slice(0, NEED_PAGE), ownerId)
          : [],
        moreContributions: mine.length > NEED_PAGE,
        names,
        updates: updates.slice(0, NEED_PAGE).map((u) => ({
          id: u.id,
          action: u.action,
          text: u.text,
          createdAt: u.createdAt.toISOString()
        })),
        nextUpdates:
          updates.length > NEED_PAGE ? updates[NEED_PAGE - 1].id : null
      };
    }
    return { ...base, canCoordinate, need: await details() };
  });
}
export type ExchangeNeedsView = Awaited<ReturnType<typeof readExchangeNeeds>>;
export type NeedDetailView = Extract<ExchangeNeedsView, { listingId: string }>;
export type NeedView = NonNullable<NeedDetailView["need"]>;
export type NeedSlotView = NeedView["slots"][number];
export type NeedContributionView = NonNullable<
  NeedView["contributions"][number]
>;
