import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { socialCommand, socialInput } from "./social-operations";
import { postContext, type PostTx } from "./post-access";
import { postField, postId } from "./post-input";
import { expected, PortalError } from "./portal-policy";
import { requireContactActor } from "./adult-contact-policy";
import { requirePrivilegedAuthentication } from "./privileged-auth-policy";
import { exchangeAuthority, requireExchangeActor } from "./exchange-policy";
import {
  validateHelpPublication,
  helpListingCapacity,
  helpListingActivity,
  helpListingAudit
} from "./exchange-listings";
import { discoveryCountry, discoveryPlaceId } from "./discovery-options";
import { discoveryPlaceLabel, getDiscoveryPlace } from "./discovery-places";
import { HELP_PURPOSE, HELP_SCHEMA } from "./interchurch-help-options";
import {
  helpBoolean,
  helpCategory,
  helpChoice,
  helpTermsFields,
  parseHelpTerms,
  supportedHelpDuty
} from "./interchurch-help-input";
import {
  currentHelpOffer,
  helpAuthorityKey,
  helpCoordinatorCurrent,
  helpPair,
  helpUnavailable,
  managedHelp,
  requireHelpCoordinator,
  requireHelpOpen
} from "./interchurch-help-policy";
import {
  invalidateHelpTerms,
  recordHelpChange,
  revokeHelpOffers
} from "./interchurch-help-lifecycle";

const fields: Record<string, string[]> = {
  "withdraw-coordinator": ["requestId"],
  create: ["ownerChurchId", "fields", "schema"],
  save: ["requestId", "fields", "schema", "itemPolicy", "itemConfirmed"],
  publish: ["requestId", "itemPolicy", "itemConfirmed"],
  coordinator: ["requestId", "acceptCoordinator", "coordinatorDisplay"],
  close: ["requestId", "outcome", "reason"],
  offer: [
    "requestId",
    "kind",
    "respondingChurchId",
    "schema",
    "terms",
    "acceptResponsibility",
    "externalNotices"
  ],
  "edit-offer": [
    "offerId",
    "schema",
    "terms",
    "requestTermsVersion",
    "acceptResponsibility"
  ],
  withdraw: ["offerId"],
  decline: ["offerId"],
  select: ["offerId", "requestTermsVersion", "acceptTerms", "externalNotices"],
  amend: ["offerId", "schema", "terms", "requestTermsVersion", "acceptTerms"],
  acknowledge: [
    "offerId",
    "termsVersion",
    "requestTermsVersion",
    "acceptTerms",
    "externalNotices"
  ],
  cancel: ["offerId", "reason"],
  complete: ["offerId", "reason"],
  contact: ["offerId", "contact", "termsVersion", "consent"],
  "withdraw-contact": ["offerId"]
};
async function offerRow(
  tx: PostTx,
  actorId: string,
  id: unknown,
  minimal = false
) {
  const row = await tx.interchurchHelpOffer.findUnique({
    where: { id: postId(id) },
    include: { agreement: true }
  });
  if (!row || ![row.responderId, row.coordinatorId].includes(actorId))
    throw helpUnavailable();
  if (!minimal && !(await currentHelpOffer(tx, row))) throw helpUnavailable();
  return row;
}
async function authorize(
  tx: PostTx,
  actorId: string,
  op: string,
  v: Record<string, unknown>
) {
  await requireContactActor(tx, actorId);
  if (op === "withdraw-coordinator") {
    const r = await tx.interchurchHelpRequest.findUnique({
      where: { id: postId(v.requestId) },
      select: { coordinatorId: true }
    });
    if (r?.coordinatorId !== actorId) throw helpUnavailable();
    return;
  }
  if (op === "create") {
    const c = await postContext(tx, actorId),
      a = await exchangeAuthority(tx, c),
      churchId = postId(v.ownerChurchId);
    if (!a.publishers.includes(churchId) && !a.managers.includes(churchId))
      throw helpUnavailable();
    await requirePrivilegedAuthentication(tx, actorId);
    return;
  }
  if (["save", "publish", "coordinator", "close"].includes(op)) {
    await managedHelp(tx, actorId, v.requestId);
    return;
  }
  if (op === "offer") {
    const kind = helpChoice(
        v.kind,
        { PERSONAL: 1, ORGANIZATION: 1 },
        "offer identity"
      ),
      church =
        v.respondingChurchId === null ? null : postId(v.respondingChurchId);
    if (!(await helpPair(tx, postId(v.requestId), actorId, kind, church)))
      throw helpUnavailable();
    if (kind === "ORGANIZATION")
      await requirePrivilegedAuthentication(tx, actorId);
    return;
  }
  const row = await offerRow(
    tx,
    actorId,
    v.offerId,
    ["withdraw", "withdraw-contact", "cancel"].includes(op)
  );
  if (
    ["select", "decline", "complete"].includes(op) &&
    row.coordinatorId !== actorId
  )
    throw helpUnavailable();
  if (["edit-offer", "withdraw"].includes(op) && row.responderId !== actorId)
    throw helpUnavailable();
  // Withdrawal/cancellation can always end one's own responsibility, never edit another's scope.
  if (
    !["withdraw", "withdraw-contact", "cancel"].includes(op) &&
    (row.kind === "ORGANIZATION" || row.coordinatorId === actorId)
  )
    await requirePrivilegedAuthentication(tx, actorId);
}
async function requestFields(v: unknown) {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new PortalError(400, "Use the current request editor.");
  const f = v as Record<string, unknown>;
  socialInput(f, [
    "title",
    "category",
    "terms",
    "country",
    "placeId",
    "audience",
    "acceptCoordinator",
    "coordinatorDisplay"
  ]);
  const terms = parseHelpTerms(HELP_SCHEMA, f.terms),
    category = helpCategory(f.category);
  if (category !== "EQUIPMENT" && terms.equipmentMode !== "NONE")
    throw new PortalError(
      400,
      "Use Equipment for an equipment gift or operator."
    );
  const country = discoveryCountry(f.country),
    placeId = discoveryPlaceId(f.placeId),
    place = await getDiscoveryPlace(country, placeId);
  if (!country || !placeId || !place)
    throw new PortalError(
      400,
      "Choose a supported approximate town. Do not give a street address."
    );
  return {
    terms,
    category,
    title: postField(f.title, 120, 3),
    country,
    placeId,
    placeLabel: discoveryPlaceLabel(place),
    audience: helpChoice(
      f.audience,
      { PUBLIC: 1, CHURCH: 1 },
      "request audience"
    ),
    accept: helpBoolean(f.acceptCoordinator),
    display: postField(f.coordinatorDisplay, 120, 3)
  };
}
export function interchurchHelpCommand(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const op = String(input.operation);
  if (!Object.hasOwn(fields, op))
    throw new PortalError(400, "Choose a supported ministry help action.");
  socialInput(input, [
    "operation",
    "mutationId",
    "expectedVersion",
    ...fields[op]
  ]);
  return socialCommand(
    db,
    token,
    "interchurch-help",
    input,
    async (tx, actorId) => {
      await tx.$executeRaw`SELECT set_config('gc.interchurch_help_writer', 'v1', true)`;
      if (op === "withdraw-coordinator") {
        const row = await tx.interchurchHelpRequest.findUniqueOrThrow({
          where: { id: postId(input.requestId) }
        });
        expected(input.expectedVersion, row.version);
        await revokeHelpOffers(tx, { requestId: row.id }, actorId);
        await tx.interchurchHelpRequest.update({
          where: { id: row.id },
          data: {
            coordinatorId: null,
            coordinatorKey: null,
            coordinatorDisplay: "Coordinator unavailable",
            consentVersion: { increment: 1 }
          }
        });
        const saved = await recordHelpChange(
          tx,
          row.id,
          actorId,
          "COORDINATOR_WITHDRAWN"
        );
        return {
          id: row.id,
          version: saved.version,
          message:
            "Your coordinator responsibility ended. Completed work remains recorded."
        };
      }
      if (op === "create" || op === "save") {
        if (input.schema !== HELP_SCHEMA)
          throw new PortalError(
            400,
            "Reload the current ministry help editor."
          );
        const f = await requestFields(input.fields),
          old =
            op === "save"
              ? await managedHelp(tx, actorId, input.requestId)
              : null;
        expected(input.expectedVersion, old?.version ?? 0);
        const churchId =
            old?.listing!.ownerChurchId ?? postId(input.ownerChurchId),
          context = await postContext(tx, actorId);
        requireExchangeActor(context);
        const authority = await exchangeAuthority(tx, context);
        if (old && old.outcome !== "OPEN")
          throw new PortalError(
            409,
            "Closed requests retain their receipt. Start a new deliberate request."
          );
        const accepting = f.accept && authority.managers.includes(churchId);
        if (f.accept && !accepting)
          throw new PortalError(
            403,
            "A current Exchange manager must accept coordinator responsibility."
          );
        const coordinatorKey = accepting
          ? await helpAuthorityKey(
              tx,
              actorId,
              churchId,
              "MANAGE_EXCHANGE_LISTINGS"
            )
          : (old?.coordinatorKey ?? null);
        const replacing =
          !!old &&
          accepting &&
          (old.coordinatorId !== actorId ||
            old.coordinatorKey !== coordinatorKey);
        const listingData = {
          title: f.title,
          country: f.country,
          placeId: f.placeId,
          placeLabel: f.placeLabel,
          audience: f.audience,
          audienceChurchId: f.audience === "CHURCH" ? churchId : null
        };
        if (old && old.listing!.state !== "DRAFT") {
          await validateHelpPublication(
            tx,
            context,
            authority,
            old.listing!,
            {
              ...old.listing!,
              ...listingData,
              intent: "CHURCH_NEED",
              category: null,
              condition: null,
              currency: null,
              servicePricing: null,
              serviceUnit: null
            },
            input,
            true
          );
        }
        if (!old) {
          await helpListingCapacity(tx, actorId, churchId);
          await helpListingActivity(tx, actorId, "create");
        }
        const id = old?.id ?? randomUUID();
        const listing = old
          ? await tx.exchangeListing.update({
              where: { id: old.listingId! },
              data: {
                ...listingData,
                version: { increment: 1 },
                visibilityVersion: { increment: 1 }
              }
            })
          : await tx.exchangeListing.create({
              data: {
                id,
                ownerChurchId: churchId,
                creatorId: actorId,
                intent: "CHURCH_NEED",
                helpPurpose: HELP_PURPOSE,
                ...listingData
              }
            });
        const data = {
          ...f.terms,
          category: f.category,
          coordinatorId: accepting ? actorId : (old?.coordinatorId ?? null),
          coordinatorKey,
          coordinatorDisplay:
            accepting || !old ? f.display : old.coordinatorDisplay
        };
        if (old) {
          if (replacing || old.listing!.audience !== f.audience)
            await revokeHelpOffers(tx, { requestId: id }, actorId);
          await tx.interchurchHelpRequest.update({
            where: { id },
            data: {
              ...data,
              termsVersion: { increment: 1 },
              ...(replacing ? { consentVersion: { increment: 1 } } : {})
            }
          });
          await invalidateHelpTerms(tx, id, actorId);
        } else
          await tx.interchurchHelpRequest.create({
            data: { id, listingId: id, ...data }
          });
        await helpListingAudit(
          tx,
          listing,
          actorId,
          op === "create" ? "CREATE_HELP" : "SAVE_HELP"
        );
        const saved = await recordHelpChange(tx, id, actorId, "REQUEST_SAVED");
        return {
          id,
          version: saved.version,
          message:
            old?.listing?.state === "ACTIVE"
              ? "Published ministry request updated."
              : "Ministry help draft saved privately."
        };
      }
      if (["publish", "coordinator", "close"].includes(op)) {
        const row = await managedHelp(tx, actorId, input.requestId);
        expected(input.expectedVersion, row.version);
        if (op === "coordinator") {
          if (input.acceptCoordinator !== true)
            throw new PortalError(
              400,
              "Explicitly accept the current coordinator responsibility."
            );
          const key = await helpAuthorityKey(
            tx,
            actorId,
            row.listing!.ownerChurchId!,
            "MANAGE_EXCHANGE_LISTINGS"
          );
          if (!key) throw helpUnavailable();
          await revokeHelpOffers(tx, { requestId: row.id }, actorId);
          await tx.interchurchHelpRequest.update({
            where: { id: row.id },
            data: {
              coordinatorId: actorId,
              coordinatorKey: key,
              coordinatorDisplay: postField(input.coordinatorDisplay, 120, 3),
              consentVersion: { increment: 1 },
              termsVersion: { increment: 1 }
            }
          });
        } else if (op === "publish") {
          if (
            row.outcome !== "OPEN" ||
            row.endAt <= new Date() ||
            !(await helpCoordinatorCurrent(tx, row))
          )
            throw new PortalError(
              409,
              "Review the date and obtain the current coordinator's explicit consent before publishing."
            );
          if (row.listing!.state !== "DRAFT")
            throw new PortalError(409, "This request is already published.");
          const c = await postContext(tx, actorId),
            a = await exchangeAuthority(tx, c);
          await validateHelpPublication(
            tx,
            c,
            a,
            row.listing!,
            {
              ...row.listing!,
              intent: "CHURCH_NEED",
              audience: row.listing!.audience as "PUBLIC" | "CHURCH",
              category: null,
              condition: null,
              currency: null,
              servicePricing: null,
              serviceUnit: null
            },
            input
          );
          const listing = await tx.exchangeListing.update({
            where: { id: row.listingId! },
            data: {
              state: "ACTIVE",
              publishedAt: new Date(),
              confirmedAt: new Date(),
              itemPolicy: String(input.itemPolicy),
              version: { increment: 1 },
              visibilityVersion: { increment: 1 }
            }
          });
          await helpListingAudit(tx, listing, actorId, "PUBLISH_HELP");
        } else {
          const outcome = helpChoice(
              input.outcome,
              { CLOSED: 1, CANCELED: 1, PARTIAL: 1, FULFILLED: 1 },
              "request outcome"
            ),
            reason = postField(input.reason, 1000, 3);
          if (outcome === "FULFILLED" || outcome === "PARTIAL") {
            await requireHelpCoordinator(tx, row, actorId);
            const agreements = await tx.interchurchHelpAgreement.findMany({
              where: { offer: { requestId: row.id } },
              take: 101
            });
            if (agreements.length > 100)
              throw new PortalError(
                409,
                "These agreements need a size review."
              );
            if (!agreements.some((a) => a.state === "COMPLETED"))
              throw new PortalError(
                409,
                "Record the delivered work before recording fulfillment."
              );
            if (
              outcome === "FULFILLED" &&
              agreements.some((a) => a.state !== "COMPLETED")
            )
              throw new PortalError(
                409,
                "Every selected agreement must have an explicit completion receipt. Use Partly fulfilled for unmet scope."
              );
          }
          await tx.interchurchHelpRequest.update({
            where: { id: row.id },
            data: {
              outcome,
              outcomeReason: reason,
              completedAt: outcome === "FULFILLED" ? new Date() : null
            }
          });
          const listing = await tx.exchangeListing.update({
            where: { id: row.listingId! },
            data: {
              state: "CLOSED",
              version: { increment: 1 },
              visibilityVersion: { increment: 1 }
            }
          });
          await helpListingAudit(tx, listing, actorId, "CLOSE_HELP");
        }
        const saved = await recordHelpChange(
          tx,
          row.id,
          actorId,
          op.toUpperCase(),
          undefined,
          typeof input.reason === "string" ? input.reason : ""
        );
        return {
          id: row.id,
          version: saved.version,
          message: "Request updated. Agreement completion remains separate."
        };
      }
      if (op === "offer") {
        const kind = helpChoice(
            input.kind,
            { PERSONAL: 1, ORGANIZATION: 1 },
            "offer identity"
          ),
          churchId =
            input.respondingChurchId === null
              ? null
              : postId(input.respondingChurchId);
        const pair = await helpPair(
          tx,
          postId(input.requestId),
          actorId,
          kind,
          churchId
        );
        if (!pair) throw helpUnavailable();
        expected(input.expectedVersion, pair.request.termsVersion);
        requireHelpOpen(pair.request);
        supportedHelpDuty(
          pair.request as Parameters<typeof supportedHelpDuty>[0]
        );
        const terms = parseHelpTerms(input.schema, input.terms);
        supportedHelpDuty(terms);
        if (input.acceptResponsibility !== true)
          throw new PortalError(
            400,
            "Explicitly accept only your own participation or the church resources you may represent. You cannot sign up another adult."
          );
        const external = helpBoolean(input.externalNotices);
        if (
          await tx.interchurchHelpOffer.findFirst({
            where: {
              requestId: pair.request.id,
              responderId: actorId,
              kind,
              respondingChurchId: churchId,
              state: { in: ["OFFERED", "SELECTED"] },
              authorityKey: { not: null }
            }
          })
        )
          throw new PortalError(
            409,
            "Review or withdraw your existing offer before creating a fresh one."
          );
        if (
          (await tx.interchurchHelpOffer.count({
            where: { requestId: pair.request.id }
          })) >= 100
        )
          throw new PortalError(
            409,
            "This request has reached its private offer limit."
          );
        const row = await tx.interchurchHelpOffer.create({
          data: {
            id: randomUUID(),
            requestId: pair.request.id,
            responderId: actorId,
            coordinatorId: pair.request.coordinatorId,
            respondingChurchId: churchId,
            kind,
            requestTermsVersion: pair.request.termsVersion,
            authorityKey: pair.authorityKey,
            terms: helpTermsFields(terms),
            noticeSince: external ? new Date() : null
          }
        });
        await recordHelpChange(tx, row.requestId, actorId, "OFFERED", row.id);
        return {
          id: row.id,
          version: row.version,
          message:
            "Private offer saved. No agreement or other person's participation has been created."
        };
      }
      const minimal = ["withdraw", "withdraw-contact", "cancel"].includes(op),
        offer = await offerRow(tx, actorId, input.offerId, minimal),
        request = await tx.interchurchHelpRequest.findUniqueOrThrow({
          where: { id: offer.requestId },
          include: { listing: true }
        }),
        agreement = offer.agreement;
      const offerAction = [
        "edit-offer",
        "withdraw",
        "decline",
        "select"
      ].includes(op);
      expected(
        input.expectedVersion,
        offerAction ? offer.version : (agreement?.version ?? 0)
      );
      if (op === "withdraw" || op === "decline") {
        if (offer.state !== "OFFERED")
          throw new PortalError(
            409,
            "Only pending offers can be withdrawn or declined. Cancel an agreed commitment separately."
          );
        await tx.interchurchHelpOffer.update({
          where: { id: offer.id },
          data: {
            state: op === "withdraw" ? "WITHDRAWN" : "DECLINED",
            endedAt: new Date(),
            version: { increment: 1 }
          }
        });
      } else if (op === "edit-offer") {
        if (offer.state !== "OFFERED")
          throw new PortalError(
            409,
            "Use an agreement amendment for selected help."
          );
        requireHelpOpen(request);
        expected(input.requestTermsVersion, request.termsVersion);
        const terms = parseHelpTerms(input.schema, input.terms);
        supportedHelpDuty(terms);
        supportedHelpDuty(request as Parameters<typeof supportedHelpDuty>[0]);
        if (input.acceptResponsibility !== true)
          throw new PortalError(
            400,
            "Accept the revised responsibility explicitly."
          );
        await tx.interchurchHelpOffer.update({
          where: { id: offer.id },
          data: {
            terms: helpTermsFields(terms),
            requestTermsVersion: request.termsVersion,
            version: { increment: 1 }
          }
        });
      } else if (op === "select") {
        await requireHelpCoordinator(tx, request, actorId);
        requireHelpOpen(request);
        expected(input.requestTermsVersion, request.termsVersion);
        expected(offer.requestTermsVersion, request.termsVersion);
        if (offer.state !== "OFFERED" || agreement)
          throw new PortalError(409, "This offer has already been reviewed.");
        supportedHelpDuty(request as Parameters<typeof supportedHelpDuty>[0]);
        supportedHelpDuty(parseHelpTerms(offer.schema, offer.terms));
        if (input.acceptTerms !== true)
          throw new PortalError(
            400,
            "Acknowledge the exact displayed offer terms."
          );
        const notice = helpBoolean(input.externalNotices);
        await tx.interchurchHelpAgreement.create({
          data: {
            id: randomUUID(),
            offerId: offer.id,
            requestTermsVersion: request.termsVersion,
            offerVersion: offer.version + 1,
            authorityKey: offer.authorityKey,
            terms: offer.terms as Prisma.InputJsonValue,
            requesterAcknowledged: 1,
            requesterNoticeSince: notice ? new Date() : null
          }
        });
        await tx.interchurchHelpOffer.update({
          where: { id: offer.id },
          data: { state: "SELECTED", version: { increment: 1 } }
        });
      } else {
        if (!agreement)
          throw new PortalError(409, "This offer has no agreement yet.");
        if (op === "withdraw-contact") {
          await tx.interchurchHelpAgreement.update({
            where: { id: agreement.id },
            data: {
              ...(actorId === offer.responderId
                ? { responderContact: "" }
                : { requesterContact: "" }),
              contactVersion: { increment: 1 },
              version: { increment: 1 }
            }
          });
        } else if (op === "cancel") {
          if (["CANCELED", "COMPLETED"].includes(agreement.state))
            throw new PortalError(
              409,
              "This agreement has already ended. Completed work remains recorded."
            );
          await tx.interchurchHelpAgreement.update({
            where: { id: agreement.id },
            data: {
              state: "CANCELED",
              canceledAt: new Date(),
              completionNote: postField(input.reason, 1000, 3),
              requesterContact: "",
              responderContact: "",
              version: { increment: 1 },
              contactVersion: { increment: 1 }
            }
          });
        } else {
          if (agreement.authorityKey !== offer.authorityKey)
            throw helpUnavailable();
          if (request.outcome === "CANCELED")
            throw new PortalError(
              409,
              "The request was canceled. No new agreement acceptance is available."
            );
          if (["COMPLETED", "CANCELED", "REVOKED"].includes(agreement.state))
            throw new PortalError(
              409,
              "This agreement has ended. Start fresh for new help."
            );
          supportedHelpDuty(request as Parameters<typeof supportedHelpDuty>[0]);
          if (op === "amend") {
            expected(input.requestTermsVersion, request.termsVersion);
            const terms = parseHelpTerms(input.schema, input.terms);
            supportedHelpDuty(terms);
            if (input.acceptTerms !== true)
              throw new PortalError(
                400,
                "Acknowledge the proposed terms explicitly."
              );
            const version = agreement.termsVersion + 1;
            await tx.interchurchHelpAgreement.update({
              where: { id: agreement.id },
              data: {
                terms: helpTermsFields(terms),
                termsVersion: version,
                requestTermsVersion: request.termsVersion,
                offerVersion: offer.version + 1,
                state: "NEEDS_REVIEW",
                requesterAcknowledged:
                  actorId === offer.coordinatorId ? version : null,
                responderAcknowledged:
                  actorId === offer.responderId ? version : null,
                requesterContact: "",
                responderContact: "",
                contactVersion: { increment: 1 },
                version: { increment: 1 }
              }
            });
          } else if (op === "acknowledge") {
            expected(input.termsVersion, agreement.termsVersion);
            expected(input.requestTermsVersion, request.termsVersion);
            expected(agreement.requestTermsVersion, request.termsVersion);
            if (input.acceptTerms !== true)
              throw new PortalError(
                400,
                "Acknowledge the exact current agreement terms."
              );
            supportedHelpDuty(parseHelpTerms(HELP_SCHEMA, agreement.terms));
            const external = helpBoolean(input.externalNotices),
              requester = actorId === offer.coordinatorId;
            const a = requester
                ? agreement.termsVersion
                : agreement.requesterAcknowledged,
              b = requester
                ? agreement.responderAcknowledged
                : agreement.termsVersion;
            await tx.interchurchHelpAgreement.update({
              where: { id: agreement.id },
              data: {
                requesterAcknowledged: a,
                responderAcknowledged: b,
                state:
                  a === agreement.termsVersion && b === agreement.termsVersion
                    ? "CONFIRMED"
                    : "NEEDS_REVIEW",
                ...(requester
                  ? { requesterNoticeSince: external ? new Date() : null }
                  : { responderNoticeSince: external ? new Date() : null }),
                version: { increment: 1 }
              }
            });
          } else if (op === "complete") {
            await requireHelpCoordinator(tx, request, actorId);
            if (
              agreement.state !== "CONFIRMED" ||
              agreement.requestTermsVersion !== request.termsVersion
            )
              throw new PortalError(
                409,
                "Only current confirmed help can receive an explicit completion receipt."
              );
            await tx.interchurchHelpAgreement.update({
              where: { id: agreement.id },
              data: {
                state: "COMPLETED",
                completionNote: postField(input.reason, 1000, 3),
                completedAt: new Date(),
                requesterContact: "",
                responderContact: "",
                version: { increment: 1 },
                contactVersion: { increment: 1 }
              }
            });
          } else if (op === "contact") {
            expected(input.termsVersion, agreement.termsVersion);
            if (
              agreement.state !== "CONFIRMED" ||
              agreement.requestTermsVersion !== request.termsVersion ||
              input.consent !== true
            )
              throw new PortalError(
                409,
                "Contact sharing requires your explicit consent for the current confirmed pair."
              );
            const contact = postField(input.contact, 250, 1);
            await tx.interchurchHelpAgreement.update({
              where: { id: agreement.id },
              data: {
                ...(actorId === offer.responderId
                  ? { responderContact: contact }
                  : { requesterContact: contact }),
                contactVersion: { increment: 1 },
                version: { increment: 1 }
              }
            });
          }
        }
        await tx.interchurchHelpOffer.update({
          where: { id: offer.id },
          data: { version: { increment: 1 } }
        });
      }
      await recordHelpChange(
        tx,
        request.id,
        actorId,
        op.toUpperCase(),
        offer.id
      );
      const saved = await tx.interchurchHelpOffer.findUniqueOrThrow({
        where: { id: offer.id },
        include: { agreement: true }
      });
      return {
        id: saved.id,
        version: offerAction ? saved.version : saved.agreement!.version,
        message:
          "Your ministry help action is recorded. Review the current receipt."
      };
    },
    (tx, actor) => authorize(tx, actor, op, input)
  );
}
