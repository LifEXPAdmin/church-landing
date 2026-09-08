import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  assertPortalTestDatabase,
  seedPortal,
  createPortalActor
} from "./seed-portal";
import { accountConfig } from "../lib/platform/account-config";
import { readSupport, supportCommand } from "../lib/platform/support";
import { SUPPORT_NOTICE } from "../lib/platform/support-types";
export async function seedSupport(db: PrismaClient) {
  await assertPortalTestDatabase(db);
  const portal = await seedPortal(db);
  const owner = await createPortalActor(db, "support_owner");
  const backup = await createPortalActor(db, "support_backup");
  const manager = await createPortalActor(db, "support_route");
  const ownerGrant = await db.supportCapabilityGrant.create({
    data: { userId: owner.id, capability: "RESPOND" }
  });
  const backupGrant = await db.supportCapabilityGrant.create({
    data: { userId: backup.id, capability: "RESPOND" }
  });
  await db.supportCapabilityGrant.create({
    data: { userId: manager.id, capability: "ASSIGN" }
  });
  await db.supportCapabilityGrant.create({
    data: { userId: owner.id, capability: "REDACT" }
  });
  await db.supportIntakeSetting.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ownerGrantId: ownerGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    },
    update: {
      ownerGrantId: ownerGrant.id,
      enabled: true,
      approvedNoticeVersion: SUPPORT_NOTICE
    }
  });
  return { ...portal, owner, backup, manager, ownerGrant, backupGrant };
}
export type SupportFixture = Awaited<ReturnType<typeof seedSupport>>;
export async function requestInput(
  db: PrismaClient,
  token: string,
  overrides: Record<string, unknown> = {}
) {
  const s = await readSupport(db, token, "new", {
    churchId:
      typeof overrides.churchId === "string" ? overrides.churchId : undefined
  });
  return {
    operation: "create",
    requestKey: randomUUID(),
    category: "ACCOUNT_WEBSITE",
    subject: "Fictional private help subject",
    description: "Fictional private description for isolated support tests.",
    recipientId: s.intake.recipient?.id,
    recipientVersion: s.intake.recipient?.version,
    notice: SUPPORT_NOTICE,
    consent: true,
    ...overrides
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const db = new PrismaClient();
  try {
    const f = await seedSupport(db);
    const created = await supportCommand(
      db,
      f.memberA.token,
      await requestInput(db, f.memberA.token, { churchId: f.churchA.id })
    );
    const actors = Object.fromEntries(
      Object.entries({
        requester: f.memberA,
        pending: f.pending,
        owner: f.owner,
        backup: f.backup,
        manager: f.manager,
        coordinator: f.contact,
        unrelated: f.memberB
      }).map(([role, a]) => [
        role,
        { name: a.name, email: a.email, password: a.password }
      ])
    );
    await writeFile(
      join(dirname(accountConfig().sinkDirectory!), "SUPPORT_PREVIEW.json"),
      JSON.stringify({
        origin: accountConfig().origin,
        actors,
        caseId: created.caseId,
        churchId: f.churchA.id
      }),
      { mode: 0o600, flag: "wx" }
    );
    console.log(
      "Fictional support preview prepared in ignored SUPPORT_PREVIEW.json; no tokens exported."
    );
  } finally {
    await db.$disconnect();
  }
}
