import type {
  Prisma,
  PrismaClient,
  InterchurchHelpRequest
} from "@prisma/client";
import { withPostRead } from "./post-access";
import {
  exchangeReadableWhere,
  exchangeDiscoveryWhere,
  exchangeAuthority,
  exchangeCanManage,
  requireExchangeActor
} from "./exchange-policy";
import {
  currentHelpOffers,
  helpChurchOfferChoices,
  helpCoordinatorCurrent,
  helpUnavailable
} from "./interchurch-help-policy";
import { HELP_PAGE_SIZE, HELP_PURPOSE } from "./interchurch-help-options";
import {
  helpCategory,
  helpTermsFields,
  parseHelpTerms,
  parseHelpAgreementTerms,
  type HelpTerms
} from "./interchurch-help-input";
import { postId, postField } from "./post-input";
import { PortalError } from "./portal-policy";
import { effectiveChurchGrants } from "./church-permissions";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import {
  helpScheduleChoices,
  readHelpSchedule
} from "./interchurch-help-schedule";

export function publicHelp(row: InterchurchHelpRequest, management = false) {
  return {
    id: row.id,
    version: management ? row.version : row.termsVersion,
    termsVersion: row.termsVersion,
    category: row.category,
    terms: helpTermsFields(row as HelpTerms),
    coordinatorDisplay: row.coordinatorDisplay,
    outcome: row.outcome,
    outcomeReason: row.outcomeReason
  };
}
export function readInterchurchHelp(
  db: PrismaClient,
  token: unknown,
  q: Record<string, unknown>
) {
  return withPostRead(db, token, async (tx, context) => {
    const actor = context.actorId ? { id: context.actorId } : null,
      view = q.view ?? "list";
    const after = q.after
      ? view === "schedule"
        ? typeof q.after === "string" && q.after.length <= 800
          ? q.after
          : (() => {
              throw new PortalError(
                400,
                "Refresh the current schedule choices."
              );
            })()
        : postId(q.after)
      : undefined;
    if (view === "schedule") {
      requireExchangeActor(context);
      const offer = await tx.interchurchHelpOffer.findUnique({
        where: { id: postId(q.id) },
        include: { agreement: true }
      });
      if (
        !offer ||
        ![offer.coordinatorId, offer.responderId].includes(actor!.id) ||
        !offer.agreement ||
        !["NEEDS_REVIEW", "CONFIRMED"].includes(offer.agreement.state)
      )
        throw helpUnavailable();
      const pair = (await currentHelpOffers(tx, [offer])).get(offer.id);
      if (
        !pair?.request.listing?.ownerChurchId ||
        !offer.coordinatorId ||
        !offer.responderId
      )
        throw helpUnavailable();
      if (offer.coordinatorId === actor!.id || offer.kind === "ORGANIZATION")
        await requirePrivilegedAuthentication(tx, actor!.id);
      if (q.category !== "EVENT" && q.category !== "VOLUNTEER_SLOT")
        throw new PortalError(400, "Choose events or volunteer shifts.");
      const choices = await helpScheduleChoices(
        tx,
        {
          coordinatorId: offer.coordinatorId,
          responderId: offer.responderId,
          ownerChurchId: pair.request.listing.ownerChurchId
        },
        q.category,
        after
      );
      return { view: "schedule" as const, owner: actor!.id, ...choices };
    }
    if (view === "context") {
      requireExchangeActor(context);
      const authority = await exchangeAuthority(tx, context);
      const grants = await effectiveChurchGrants(
        tx,
        context.actorId!,
        context.churches,
        ["COMMIT_INTERCHURCH_HELP"]
      );
      const churches = await tx.church.findMany({
        where: {
          id: {
            in: [
              ...new Set([
                ...authority.managers,
                ...authority.publishers,
                ...grants.map((g) => g.churchId)
              ])
            ]
          }
        },
        select: { id: true, name: true },
        take: 201
      });
      if (churches.length > 200)
        throw new PortalError(503, "Your church duties need a size review.");
      const drafts = await tx.interchurchHelpRequest.findMany({
        where: {
          schema: 1,
          recoveryRequired: false,
          listing: {
            state: "DRAFT",
            ownerChurchId: {
              in: [...authority.managers, ...authority.publishers]
            },
            OR: [
              { creatorId: actor!.id },
              { ownerChurchId: { in: authority.managers } }
            ]
          }
        },
        select: { id: true, listing: { select: { title: true } } },
        orderBy: { id: "asc" },
        take: 21
      });
      const offerChurches = await helpChurchOfferChoices(
        tx,
        actor!.id,
        churches.map((c) => c.id)
      );
      return {
        view: "context" as const,
        owner: actor!.id,
        drafts: drafts.slice(0, 20),
        moreDrafts: drafts.length > 20,
        churches: churches.map((c) => ({
          ...c,
          canDraft:
            authority.managers.includes(c.id) ||
            authority.publishers.includes(c.id),
          canManage: authority.managers.includes(c.id),
          canOffer: offerChurches.has(c.id)
        }))
      };
    }
    if (view === "list") {
      const category = q.category ? helpCategory(q.category) : undefined;
      const area = postField(q.area ?? "", 120),
        date = q.date;
      if (
        date &&
        (typeof date !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date)))
      )
        throw new PortalError(400, "Choose a supported date.");
      const rows = await tx.interchurchHelpRequest.findMany({
        where: {
          schema: 1,
          recoveryRequired: false,
          ...(category ? { category } : {}),
          ...(date
            ? { startAt: { gte: new Date(String(date) + "T00:00:00Z") } }
            : {}),
          ...(after ? { id: { gt: after } } : {}),
          listing: {
            AND: [
              { helpPurpose: HELP_PURPOSE },
              exchangeDiscoveryWhere(context),
              ...(area
                ? [
                    {
                      placeLabel: {
                        contains: area,
                        mode: "insensitive" as const
                      }
                    }
                  ]
                : [])
            ]
          }
        },
        include: {
          listing: {
            select: {
              title: true,
              placeLabel: true,
              ownerChurch: { select: { name: true } },
              audience: true
            }
          }
        },
        orderBy: { id: "asc" },
        take: HELP_PAGE_SIZE + 1
      });
      return {
        view: "list" as const,
        requests: rows
          .slice(0, HELP_PAGE_SIZE)
          .map((r) => ({ ...publicHelp(r), listing: r.listing })),
        next: rows.length > HELP_PAGE_SIZE ? rows[HELP_PAGE_SIZE - 1].id : null
      };
    }
    if (view === "request") {
      const row = await tx.interchurchHelpRequest.findUnique({
        where: { id: postId(q.id) },
        include: {
          listing: {
            include: { ownerChurch: { select: { id: true, name: true } } }
          }
        }
      });
      if (
        !row?.listing ||
        row.schema !== 1 ||
        row.recoveryRequired ||
        row.listing.helpPurpose !== HELP_PURPOSE
      )
        throw helpUnavailable();
      const authority = await exchangeAuthority(tx, context),
        manage = exchangeCanManage(context, authority, row.listing);
      if (
        !manage &&
        !(await tx.exchangeListing.findFirst({
          where: {
            AND: [{ id: row.listingId! }, exchangeReadableWhere(context)]
          },
          select: { id: true }
        }))
      )
        throw helpUnavailable();
      const current = await helpCoordinatorCurrent(tx, row);
      return {
        view: "request" as const,
        request: publicHelp(row, manage),
        listing: {
          id: row.listing.id,
          title: row.listing.title,
          state: row.listing.state,
          church: row.listing.ownerChurch!,
          country: row.listing.country,
          placeId: row.listing.placeId,
          placeLabel: row.listing.placeLabel,
          audience: row.listing.audience
        },
        manage,
        isCoordinator: actor?.id === row.coordinatorId && current,
        coordinatorCurrent: current,
        owner: actor?.id ?? null,
        canOffer:
          !!actor &&
          context.eligible &&
          current &&
          actor.id !== row.coordinatorId &&
          row.outcome === "OPEN" &&
          row.listing.state === "ACTIVE" &&
          row.listing.moderationState === "VISIBLE" &&
          !row.listing.recoveryRequired &&
          row.endAt > new Date() &&
          row.dutyClass === "ADULT_LOGISTICS"
      };
    }
    if (view !== "offers" && view !== "offer")
      throw new PortalError(400, "Choose a supported ministry help view.");
    requireExchangeActor(context);
    const where: Prisma.InterchurchHelpOfferWhereInput = {
      OR: [{ responderId: actor!.id }, { coordinatorId: actor!.id }],
      ...(q.requestId ? { requestId: postId(q.requestId) } : {}),
      ...(view === "offer"
        ? { id: postId(q.id) }
        : after
          ? { id: { gt: after } }
          : {})
    };
    const rows = await tx.interchurchHelpOffer.findMany({
      where,
      include: { agreement: true },
      orderBy: { id: "asc" },
      take: view === "offer" ? 1 : HELP_PAGE_SIZE + 1
    });
    const currentPairs = await currentHelpOffers(
      tx,
      rows.slice(0, HELP_PAGE_SIZE)
    );
    const permitted = rows.filter((row) => currentPairs.has(row.id));
    if (
      permitted.some(
        (row) => row.coordinatorId === actor!.id || row.kind === "ORGANIZATION"
      )
    )
      await requirePrivilegedAuthentication(tx, actor!.id);
    const people = await tx.platformUser.findMany({
      where: {
        id: {
          in: permitted.flatMap((row) =>
            row.responderId ? [row.responderId] : []
          )
        }
      },
      select: { id: true, name: true }
    });
    const represented = await tx.church.findMany({
      where: {
        id: {
          in: permitted.flatMap((row) =>
            row.respondingChurchId ? [row.respondingChurchId] : []
          )
        }
      },
      select: { id: true, name: true }
    });
    const projected = [];
    for (const row of rows.slice(0, HELP_PAGE_SIZE)) {
      const pair = currentPairs.get(row.id),
        a = row.agreement;
      const own = row.responderId === actor!.id;
      if (!pair) {
        projected.push({
          id: row.id,
          version: row.version,
          available: false as const,
          own,
          state: row.state,
          agreement: a ? { version: a.version, state: a.state } : null
        });
        continue;
      }
      let terms;
      try {
        terms = parseHelpTerms(1, row.terms);
      } catch {
        continue;
      }
      let agreementTerms: ReturnType<typeof parseHelpAgreementTerms> | null =
        null;
      let scheduleSource: Awaited<ReturnType<typeof readHelpSchedule>> = null;
      if (a && a.authorityKey === row.authorityKey) {
        try {
          agreementTerms = parseHelpAgreementTerms(a.terms);
          if (
            agreementTerms.schedule &&
            row.coordinatorId &&
            row.responderId &&
            pair.request.listing?.ownerChurchId
          )
            scheduleSource = await readHelpSchedule(
              tx,
              {
                coordinatorId: row.coordinatorId,
                responderId: row.responderId,
                ownerChurchId: pair.request.listing.ownerChurchId
              },
              agreementTerms.schedule
            );
        } catch {
          agreementTerms = null;
        }
        if (!agreementTerms || (agreementTerms.schedule && !scheduleSource)) {
          projected.push({
            id: row.id,
            version: row.version,
            available: false as const,
            own,
            state: row.state,
            agreement: { version: a.version, state: a.state }
          });
          continue;
        }
      }
      const currentAgreement =
        a && a.authorityKey === row.authorityKey && agreementTerms;
      const scheduleChanged = !!scheduleSource?.changed;
      projected.push({
        id: row.id,
        version: row.version,
        available: true as const,
        own,
        state: row.state,
        kind: row.kind,
        respondingChurchId: row.respondingChurchId,
        respondingChurchName:
          represented.find((church) => church.id === row.respondingChurchId)
            ?.name ?? null,
        responderName:
          people.find((person) => person.id === row.responderId)?.name ??
          "Unavailable account",
        coordinatorDisplay: pair.request.coordinatorDisplay,
        requestId: row.requestId,
        requestTitle: pair.request.listing!.title,
        requestTermsVersion: pair.request.termsVersion,
        reviewedRequestVersion: row.requestTermsVersion,
        terms: helpTermsFields(terms),
        agreement: currentAgreement
          ? {
              id: a.id,
              version: a.version,
              termsVersion: a.termsVersion,
              requestTermsVersion: a.requestTermsVersion,
              state:
                scheduleChanged &&
                ["CONFIRMED", "NEEDS_REVIEW"].includes(a.state)
                  ? "NEEDS_REVIEW"
                  : a.state,
              terms: helpTermsFields(currentAgreement.terms),
              schedule: scheduleSource
                ? {
                    kind: scheduleSource.binding.kind,
                    id: scheduleSource.binding.id,
                    fingerprint: scheduleSource.binding.fingerprint,
                    title: scheduleSource.title,
                    href: scheduleSource.href,
                    startLocal: scheduleSource.startLocal,
                    endLocal: scheduleSource.endLocal,
                    timeZone: scheduleSource.timeZone,
                    allDay: scheduleSource.allDay,
                    changed: scheduleChanged
                  }
                : null,
              requesterAcknowledged: scheduleChanged
                ? null
                : a.requesterAcknowledged,
              responderAcknowledged: scheduleChanged
                ? null
                : a.responderAcknowledged,
              completionNote: a.completionNote,
              contactVersion: a.contactVersion,
              ownContact: scheduleChanged
                ? ""
                : own
                  ? a.responderContact
                  : a.requesterContact,
              otherContact:
                a.state === "CONFIRMED" &&
                !scheduleChanged &&
                a.requestTermsVersion === pair.request.termsVersion
                  ? own
                    ? a.requesterContact
                    : a.responderContact
                  : ""
            }
          : null
      });
    }
    if (view === "offer" && !projected.length) throw helpUnavailable();
    const responsibilities = await tx.interchurchHelpRequest.findMany({
      where: { coordinatorId: actor!.id, coordinatorKey: { not: null } },
      select: { id: true, version: true },
      orderBy: { id: "asc" },
      take: 20
    });
    return {
      view: "offers" as const,
      responsibilities,
      offers: projected,
      next: rows.length > HELP_PAGE_SIZE ? rows[HELP_PAGE_SIZE - 1].id : null,
      owner: actor!.id
    };
  });
}
