import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";

/** Fresh fictional actors and one opportunity; never replace existing records. */
export async function seedVolunteerAvailability(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const fixture = await seedVolunteerApplications(db, true, 2);
  assert.equal(
    await db.volunteerApplication.count({
      where: { opportunityId: fixture.opportunity.id }
    }),
    0
  );
  return {
    ...fixture,
    privateAvailability:
      "Fictional availability: Tuesday evenings, America/Chicago.",
    editedAvailability:
      "Fictional availability: Saturday mornings, America/Chicago.",
    privateStatement: "Fictional private browser application statement."
  };
}
