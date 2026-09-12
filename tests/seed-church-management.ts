import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import {
  assertPortalTestDatabase,
  createPortalActor,
  seedOperatorGrants,
  type PortalActor
} from "./seed-portal";
import {
  churchClaimCommand,
  CLAIM_POLICY
} from "../lib/platform/church-claims";
import { projectListingData } from "../lib/platform/church-listing-data";
import {
  projectClaimAuthority,
  type ClaimScope
} from "../lib/platform/church-claim-data";

/** Isolated fixtures exercise the same independent review and activation as the UI. */
export async function seedManagedChurch(
  db: PrismaClient,
  manager: PortalActor,
  scopes: ClaimScope[] = [
    "MANAGE_CHURCH_PROFILE",
    "MANAGE_STRUCTURE",
    "MANAGE_CHURCH_ACCESS"
  ]
) {
  await assertPortalTestDatabase(db);
  process.env.CHURCH_CLAIM_REVIEW_ENABLED = "true";
  process.env.CHURCH_CLAIM_POLICY_VERSION = CLAIM_POLICY;
  const reviewer = await createPortalActor(db, "churchtoolsreview");
  await seedOperatorGrants(db, reviewer, ["REVIEW_CHURCH_CLAIMS"]);
  const church = await db.church.create({
    data: {
      slug: randomUUID(),
      name: "Fictional scoped church",
      summary: "A fictional church used for isolated verification.",
      serviceArea: "Fictional region",
      communityListed: true
    }
  });
  const command = (actor: PortalActor, input: Record<string, unknown>) =>
    churchClaimCommand(db, actor.token, input);
  const created = await command(manager, {
    operation: "create",
    requestKey: randomUUID(),
    churchId: church.id
  });
  await command(manager, {
    operation: "save",
    id: created.id,
    expectedVersion: 1,
    expectedChurchVersion: church.version,
    profile: projectListingData(church),
    scopes,
    authority: projectClaimAuthority({
      position: "Fictional secretary",
      leader: "Fictional independent leader",
      method: "EMAIL",
      contact: "private-authority-marker@example.test",
      availability: "Weekdays UTC",
      reference: "Independent fictional directory"
    })
  });
  const current = () =>
    db.churchClaim.findUniqueOrThrow({ where: { id: created.id } });
  await command(manager, {
    operation: "submit",
    id: created.id,
    expectedVersion: (await current()).version,
    contactConsent: true,
    searchedConfirmed: true
  });
  await command(reviewer, {
    operation: "review",
    id: created.id,
    expectedVersion: (await current()).version,
    action: "APPROVE",
    reason: "Authority checked for the requested fixture scopes",
    trustedSource: "Independent fictional directory",
    confirmingPerson: "Fictional confirming church leader",
    checkedAt: new Date().toISOString().slice(0, 10),
    independentConfirmed: true,
    scopeConfirmed: true,
    distinctConfirmed: true
  });
  await command(manager, {
    operation: "activate",
    id: created.id,
    expectedVersion: (await current()).version,
    accessConfirmed: true,
    publicConfirmed: false
  });
  const connection = await db.churchConnection.findUniqueOrThrow({
    where: { userId_churchId: { userId: manager.id, churchId: church.id } }
  });
  return { church, claim: await current(), connection };
}
