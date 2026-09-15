import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { seedParticipation } from "./seed-post-participation";
import { assertPortalTestDatabase, createPortalActor } from "./seed-portal";
import { portalCommand } from "../lib/platform/portal";
import { postCommand } from "../lib/platform/post-commands";
import { saveChurchWelcome } from "../lib/platform/church-welcome-commands";

export async function seedOnboarding(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const f = await seedParticipation(db);
  await portalCommand(db, f.operator.token, {
    operation: "grant",
    churchId: f.churchA.id,
    userId: f.lee.id,
    capability: "HOST_CHURCH_WELCOME",
    expectedVersion: 0
  });
  const introduction = await postCommand(db, f.val.token, {
    operation: "create",
    requestKey: randomUUID(),
    audienceChurchId: f.churchA.id,
    audience: "CHURCH",
    content: "Fictional newcomer introduction for the ordinary welcome journey."
  });
  await saveChurchWelcome(db, f.val.token, {
    operation: "tag",
    churchId: f.churchA.id,
    postId: introduction.id,
    purpose: "INTRODUCTION",
    expectedVersion: 0,
    mutationId: randomUUID()
  });
  await f.slot();
  const newcomer = await createPortalActor(db, "onboard");
  return { ...f, introduction, newcomer };
}
