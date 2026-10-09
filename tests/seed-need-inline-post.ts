import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedParticipation } from "./seed-post-participation";
import { postCommand } from "../lib/platform/post-commands";
import { exchangeNeedCommand } from "../lib/platform/exchange-need-commands";
import { exchangeListingCommand } from "../lib/platform/exchange-listings";
import { EXCHANGE_ITEM_POLICY } from "../lib/platform/exchange-options";
import { NEED_SCHEMA } from "../lib/platform/exchange-need-options";
import { privilegedAuthenticatorCommand } from "../lib/platform/privileged-auth";
import { openAuthenticator, authenticatorTotp } from "../lib/platform/admin-authenticator-crypto";

export async function seedNeedInlinePost(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const previous = process.env.PRIVILEGED_MFA_MODE;
  // Seed process only. The independently running HTTPS server remains enforce.
  process.env.PRIVILEGED_MFA_MODE = "off";
  try {
    const f = await seedParticipation(db);
    await db.church.update({ where: { id: f.churchA.id }, data: { communityListed: true } });
    for (const capability of ["MANAGE_EXCHANGE_LISTINGS", "MODERATE_EXCHANGE_LISTINGS"] as const)
      await db.churchCapabilityGrant.create({ data: { userId: f.ada.id, churchId: f.churchA.id, capability } });
    await db.socialPreferences.upsert({ where: { ownerId: f.ada.id }, create: { ownerId: f.ada.id, contactRequests: "EVERYONE" }, update: { contactRequests: "EVERYONE" } });
    const listing = await db.exchangeListing.create({ data: {
      ownerChurchId: f.churchA.id, creatorId: f.ada.id, intent: "CHURCH_NEED", category: "HOUSEHOLD",
      title: "Fictional inline and post source " + randomUUID(), description: "Isolated current-reader acceptance",
      requestedItems: "Fictional equipment", audience: "CHURCH", audienceChurchId: f.churchA.id,
      country: "US", placeId: 4887398, placeLabel: "Chicago", itemPolicy: EXCHANGE_ITEM_POLICY
    } });
    const date = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 16);
    const configured = await exchangeNeedCommand(db, f.ada.token, {
      operation: "configure", mutationId: randomUUID(), listingId: listing.id, listingVersion: listing.version,
      expectedVersion: 0, deadlineLocal: date(10), timeZone: "UTC", acceptCoordinator: true
    });
    const slots = [];
    for (const loan of [false, true]) {
      const saved = await exchangeNeedCommand(db, f.ada.token, {
        operation: "slot", mutationId: randomUUID(), needId: configured.id, slotId: randomUUID(), expectedVersion: 0,
        schema: NEED_SCHEMA, fields: { action: "DONATE", label: loan ? "Fictional loan equipment" : "Fictional supplies",
          unit: "items", target: 10, loan, returnLocal: loan ? date(7) : null, returnTimeZone: loan ? "UTC" : null,
          returnResponsibility: loan ? "Fictional coordinator returns borrowed equipment" : "", volunteerSlotId: null }
      });
      slots.push(await db.exchangeNeedSlot.findUniqueOrThrow({ where: { id: saved.id } }));
    }
    const draft = await db.exchangeListing.findUniqueOrThrow({ where: { id: listing.id } });
    await exchangeListingCommand(db, f.ada.token, { operation: "status", mutationId: randomUUID(), listingId: listing.id,
      expectedVersion: draft.version, state: "ACTIVE", itemPolicy: EXCHANGE_ITEM_POLICY, itemConfirmed: true });
    const need = await db.exchangeNeed.findUniqueOrThrow({ where: { id: configured.id } });
    const contributions = [];
    for (const slot of slots) {
      const saved = await exchangeNeedCommand(db, f.morgan.token, {
        operation: "claim", mutationId: randomUUID(), needId: need.id, slotId: slot.id, slotVersion: slot.version,
        consentVersion: need.consentVersion, id: randomUUID(), expectedVersion: 0, quantity: 2,
        note: "Fictional private inline note " + randomUUID(), price: null, currency: null,
        shareName: false, loanAccepted: slot.loan, waitlist: false
      });
      contributions.push(await db.exchangeNeedContribution.findUniqueOrThrow({ where: { id: saved.id } }));
    }
    const posts = [];
    for (let i = 0; i < 21; i++) {
      const saved = await postCommand(db, f.ada.token, { operation: "create", requestKey: randomUUID(),
        authorChurchId: f.churchA.id, type: "NEED", audience: "CHURCH", content: "Fictional private eligible post " + randomUUID() });
      posts.push(await db.platformPost.findUniqueOrThrow({ where: { id: saved.id } }));
    }
    posts.sort((a, b) => a.id.localeCompare(b.id));
    return { ...f, owner: f.morgan, manager: f.ada, other: f.blake, listing, need, slots, contributions, posts,
      page: "/platform/exchange/" + listing.id + "/needs",
      inlineEndpoint: "/api/platform/exchange?view=need-need&listingId=" + listing.id,
      postsEndpoint: "/api/platform/exchange?view=need-posts&listingId=" + listing.id };
  } finally {
    if (previous === undefined) delete process.env.PRIVILEGED_MFA_MODE;
    else process.env.PRIVILEGED_MFA_MODE = previous;
  }
}
export async function proveInlinePostManager(db: PrismaClient, f: Awaited<ReturnType<typeof seedNeedInlinePost>>) {
  if (process.env.PRIVILEGED_MFA_MODE !== "enforce") throw Error("Manager proof requires enforce mode");
  await privilegedAuthenticatorCommand(db, f.manager.token, { operation: "mfa-start", requestKey: randomUUID(), expectedVersion: 0 }, f.manager.password);
  const factor = await db.adminAuthenticator.findUniqueOrThrow({ where: { userId: f.manager.id } });
  const secret = openAuthenticator(f.manager.id, factor.secretCiphertext), enrolledCounter = BigInt(Math.floor(Date.now() / 30000));
  const enrolled = await privilegedAuthenticatorCommand(db, f.manager.token, { operation: "mfa-confirm", requestKey: randomUUID(), expectedVersion: factor.version, code: authenticatorTotp(secret, enrolledCounter) }, undefined);
  const currentCounter = BigInt(Math.floor(Date.now() / 30000));
  await privilegedAuthenticatorCommand(db, f.manager.token, { operation: "mfa-challenge", requestKey: randomUUID(), expectedVersion: Number(enrolled.version), purpose: "privileged-work", code: authenticatorTotp(secret, currentCounter > enrolledCounter ? currentCounter : enrolledCounter + BigInt(1)) }, undefined);
}
