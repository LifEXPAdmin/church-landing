import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { seedParticipation } from "./seed-post-participation";
import { volunteerCommand } from "../lib/platform/volunteer-commands";
import { postCommand } from "../lib/platform/post-commands";
export const volunteerAction = (
  operation: string,
  fields: Record<string, unknown>
) => ({ operation, mutationId: randomUUID(), ...fields });
const action = volunteerAction;
export async function seedVolunteerApplications(
  db: PrismaClient,
  timed = true,
  capacity = 1
) {
  const f = await seedParticipation(db);
  const post = timed
    ? f.post
    : await postCommand(db, f.ada.token, {
        operation: "create",
        requestKey: randomUUID(),
        authorChurchId: f.churchA.id,
        content: "Fictional ongoing welcome ministry",
        audience: "CHURCH"
      });
  const input = action("save", {
    id: randomUUID(),
    postId: post.id,
    postVersion: post.version,
    expectedVersion: 0,
    title: "Fictional welcome team",
    duties: "Welcome adults at the church.",
    requirements: "Review the duty before applying.",
    contact: "Ask through this church's published contact route.",
    commitment: timed ? "" : "One hour weekly by arrangement.",
    capacity,
    closed: false,
    independentTime: timed,
    ...(timed
      ? {
          shiftStartLocal: f.occurrence.startLocal,
          shiftEndLocal: new Date(f.occurrence.startAt.getTime() + 1800000)
            .toISOString()
            .slice(0, 16)
        }
      : {})
  });
  const saved = await volunteerCommand(db, f.ada.token, input);
  const row = await db.volunteerOpportunity.findUniqueOrThrow({
    where: { id: saved.id },
    include: { slot: true }
  });
  const snapshot = {
    opportunityVersion: row.version,
    ...(row.slot
      ? {
          slotVersion: row.slot.version,
          eventVersion: 1,
          occurrenceVersion: f.occurrence.version
        }
      : {})
  };
  const application = (statement = "Fictional private application") =>
    action("apply", {
      opportunityId: row.id,
      ...snapshot,
      expectedVersion: 0,
      statement,
      confirmed: true
    });
  return {
    ...f,
    opportunityPost: post,
    opportunity: row,
    saveInput: input,
    snapshot,
    application
  };
}
