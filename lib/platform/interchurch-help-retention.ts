import type {
  PrismaClient,
  Prisma,
  InterchurchHelpOffer,
  InterchurchHelpAgreement
} from "@prisma/client";
import { currentHelpOffers } from "./interchurch-help-policy";
import {
  recordHelpChange,
  revokeHelpOffers
} from "./interchurch-help-lifecycle";
import {
  helpTermsFields,
  parseHelpTerms,
  parseHelpAgreementTerms
} from "./interchurch-help-input";
import { readHelpSchedule } from "./interchurch-help-schedule";
type Tx = Prisma.TransactionClient;
function selectedAgreementEvidence(input: unknown) {
  try {
    const parsed = parseHelpAgreementTerms(input);
    const fields = helpTermsFields(parsed.terms);
    if (!parsed.schedule) return fields;
    // A report captures the selected agreement, not a durable copy of another
    // source's private identifiers, title or current calendar/shift details.
    const { startLocal, endLocal, timeZone, ...scope } = fields;
    void startLocal;
    void endLocal;
    void timeZone;
    return { ...scope, schedule: "Linked schedule details omitted" };
  } catch {
    return null;
  }
}
export function helpOfferEvidence(
  row: InterchurchHelpOffer & { agreement: InterchurchHelpAgreement | null }
) {
  // Deliberately selected offer/receipt only. Contact values and other pairs are excluded.
  const terms = (() => {
    try {
      return helpTermsFields(parseHelpTerms(1, row.terms));
    } catch {
      return null;
    }
  })();
  return [
    "Selected private ministry help",
    `Representation: ${row.kind}`,
    `Offer state: ${row.state}`,
    terms ? JSON.stringify(terms) : "Offer text unavailable",
    row.agreement && `Agreement state: ${row.agreement.state}`,
    row.agreement &&
      JSON.stringify(selectedAgreementEvidence(row.agreement.terms)),
    row.agreement?.completionNote
  ]
    .filter(Boolean)
    .join("\n");
}
export async function exportHelp(tx: Tx, userId: string, limit: number) {
  const rows = await tx.interchurchHelpOffer.findMany({
    where: { OR: [{ responderId: userId }, { coordinatorId: userId }] },
    include: { agreement: true },
    orderBy: { id: "asc" },
    take: limit + 1
  });
  if (rows.length > limit)
    throw Error("Ministry help export size limit exceeded");
  const pairs = new Map();
  for (let start = 0; start < rows.length; start += 100)
    for (const [id, pair] of await currentHelpOffers(
      tx,
      rows.slice(start, start + 100)
    ))
      pairs.set(id, pair);
  const result = [];
  for (const row of rows) {
    const current = pairs.get(row.id),
      own = row.responderId === userId,
      a = row.agreement;
    let agreementFields = null;
    let scheduleChanged = false;
    if (current && a?.authorityKey === row.authorityKey) {
      let parsed: ReturnType<typeof parseHelpAgreementTerms> | undefined;
      try {
        parsed = parseHelpAgreementTerms(a.terms);
      } catch {
        /* Unknown stored terms cannot enter an export. */
      }
      if (parsed) {
        const source =
          parsed.schedule &&
          row.coordinatorId &&
          row.responderId &&
          current.request.listing?.ownerChurchId
            ? await readHelpSchedule(
                tx,
                {
                  coordinatorId: row.coordinatorId,
                  responderId: row.responderId,
                  ownerChurchId: current.request.listing.ownerChurchId
                },
                parsed.schedule
              )
            : null;
        scheduleChanged = !!source?.changed;
        if (!parsed.schedule || source)
          agreementFields = helpTermsFields(parsed.terms);
      }
    }
    result.push({
      id: row.id,
      state: row.state,
      ...(own ? { authoredOffer: row.terms, kind: row.kind } : {}),
      ownContact:
        a && !scheduleChanged
          ? own
            ? a.responderContact
            : a.requesterContact
          : "",
      ...(agreementFields && a
        ? {
            agreement: {
              state:
                scheduleChanged &&
                ["CONFIRMED", "NEEDS_REVIEW"].includes(a.state)
                  ? "NEEDS_REVIEW"
                  : a.state,
              terms: agreementFields,
              termsVersion: a.termsVersion,
              completionNote: a.completionNote,
              completedAt: a.completedAt,
              canceledAt: a.canceledAt
            }
          }
        : {})
    });
  }
  return result;
}
export async function eraseHelp(tx: Tx, userId: string) {
  await tx.$executeRaw`SELECT set_config('gc.interchurch_schedule_writer', 'v1', true)`;
  await revokeHelpOffers(
    tx,
    { OR: [{ responderId: userId }, { coordinatorId: userId }] },
    userId
  );
  const rows = await tx.interchurchHelpOffer.findMany({
    where: { OR: [{ responderId: userId }, { coordinatorId: userId }] },
    include: { agreement: true }
  });
  for (const row of rows) {
    if (row.agreement) {
      let parsed: ReturnType<typeof parseHelpAgreementTerms> | undefined;
      try {
        parsed = parseHelpAgreementTerms(row.agreement.terms);
      } catch {
        /* Existing erasure below owns malformed or cleared receipts. */
      }
      if (parsed?.schedule)
        await tx.interchurchHelpAgreement.update({
          where: { id: row.agreement.id },
          data: { terms: helpTermsFields(parsed.terms) }
        });
    }
    const reported = await tx.communityReport.findFirst({
      where: { targetType: "INTERCHURCH_OFFER", targetId: row.id },
      select: { id: true }
    });
    await tx.interchurchHelpOffer.update({
      where: { id: row.id },
      data: {
        ...(row.responderId === userId
          ? { responderId: null, ...(!reported ? { terms: {} } : {}) }
          : { coordinatorId: null })
      }
    });
    // Preserve another participant's anonymous legitimate receipt; selected report evidence has its own hold owner.
    if (
      row.agreement &&
      (!row.coordinatorId || row.coordinatorId === userId) &&
      (!row.responderId || row.responderId === userId) &&
      !reported
    )
      await tx.interchurchHelpAgreement.update({
        where: { id: row.agreement.id },
        data: { terms: {}, completionNote: "" }
      });
  }
  await tx.interchurchHelpRequest.updateMany({
    where: { coordinatorId: userId },
    data: {
      coordinatorId: null,
      coordinatorKey: null,
      coordinatorDisplay: "Coordinator unavailable"
    }
  });
  await tx.interchurchHelpEvent.updateMany({
    where: { actorId: userId },
    data: { actorId: null, reason: "" }
  });
}
export async function expireHelpContacts(db: PrismaClient, now = new Date()) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221,2)`;
    const rows = await tx.interchurchHelpAgreement.findMany({
      where: {
        updatedAt: { lt: new Date(now.getTime() - 90 * 86400000) },
        OR: [
          { requesterContact: { not: "" } },
          { responderContact: { not: "" } }
        ]
      },
      include: { offer: true },
      orderBy: { id: "asc" },
      take: 100
    });
    for (const row of rows) {
      await tx.interchurchHelpAgreement.update({
        where: { id: row.id },
        data: {
          requesterContact: "",
          responderContact: "",
          contactVersion: { increment: 1 },
          version: { increment: 1 }
        }
      });
      const actor = row.offer.responderId ?? row.offer.coordinatorId;
      if (actor)
        await recordHelpChange(
          tx,
          row.offer.requestId,
          actor,
          "CONTACT_EXPIRED"
        );
    }
    return rows.length;
  });
}
