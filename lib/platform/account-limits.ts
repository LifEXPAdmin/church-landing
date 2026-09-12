import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

async function hit(
  db: Pick<Prisma.TransactionClient, "$queryRaw">,
  key: string,
  maximum: number,
  seconds: number
) {
  const rows = await db.$queryRaw<Array<{ hits: number }>>`
    INSERT INTO "PlatformAuthLimit" ("key", "hits", "expiresAt")
    VALUES (${key}, 1, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${seconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "PlatformAuthLimit"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') THEN 1
                    ELSE LEAST("PlatformAuthLimit"."hits" + 1, ${maximum + 1}) END,
      "expiresAt" = CASE WHEN "PlatformAuthLimit"."expiresAt" <= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
                        THEN (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + ${seconds} * INTERVAL '1 second'
                        ELSE "PlatformAuthLimit"."expiresAt" END
    RETURNING "hits"`;
  return rows[0].hits <= maximum;
}

export async function allowAccountAttempt(
  db: PrismaClient,
  secret: string,
  operation: string,
  ip: string,
  subject: string
) {
  const key = (value: string) =>
    createHmac("sha256", secret).update(value).digest("hex");
  // A global budget bounds both hashing work and new limiter keys across serverless instances.
  if (!(await hit(db, key("global"), 120, 60))) return false;
  await db.platformAuthLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  if (!(await hit(db, key(`ip:${ip}`), 30, 900))) return false;
  return hit(
    db,
    key(`${operation}:${subject}`),
    operation.startsWith("request-") ? 3 : 10,
    900
  );
}

// Autosave needs a separate budget from password and publishing attempts.
export async function allowWorkspaceAttempt(
  db: PrismaClient,
  secret: string,
  ownerId: string
) {
  const key = createHmac("sha256", secret)
    .update(`post-workspace:${ownerId}`)
    .digest("hex");
  return hit(db, key, 240, 900);
}

// New-activity budgets run inside the command transaction, after receipt replay.
// Transport flood limits remain independent of this per-account activity quota.
export async function activityBudget(
  db: Prisma.TransactionClient,
  secret: string,
  ownerId: string,
  activity: string,
  maximum: number,
  seconds: number
) {
  const key = createHmac("sha256", secret)
    .update(`activity:${activity}:${ownerId}`)
    .digest("hex");
  if (await hit(db, key, maximum, seconds)) return 0;
  const row = await db.platformAuthLimit.findUniqueOrThrow({ where: { key } });
  return Math.max(1, Math.ceil((row.expiresAt.getTime() - Date.now()) / 1000));
}
