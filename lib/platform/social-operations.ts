import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { PortalError } from "./portal-policy";
import { type PostTx } from "./post-access";
import { postId } from "./post-input";
export type SocialReceipt = { id: string; version: number; message: string };
export function socialInput(input: Record<string, unknown>, allowed: string[]) {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((k) => !allowed.includes(k))
  )
    throw new PortalError(
      400,
      "Use only the supported fields. Your sign-in determines the acting account."
    );
}
export function socialKey(value: unknown) {
  const key = postId(value);
  if (key.length > 80)
    throw new PortalError(
      400,
      "Use a stable reference of at most 80 characters."
    );
  return key;
}
function digest(value: unknown): string {
  function sorted(v: unknown, depth = 0): unknown {
    if (depth > 8) throw new PortalError(400, "Too many nested fields.");
    return Array.isArray(v)
      ? v.map((i) => sorted(i, depth + 1))
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, sorted(x, depth + 1)])
          )
        : v;
  }
  const body = JSON.stringify(sorted(value));
  if (Buffer.byteLength(body) > 65536)
    throw new PortalError(400, "These entries are too large.");
  return createHash("sha256").update(body).digest("hex");
}
export function socialCommand(
  db: PrismaClient,
  token: unknown,
  domain: string,
  input: Record<string, unknown>,
  run: (tx: PostTx, ownerId: string) => Promise<SocialReceipt>,
  beforeReplay?: (tx: PostTx, ownerId: string) => Promise<void>
) {
  const key = `${domain}:${socialKey(input.mutationId)}`,
    fingerprint = digest(input);
  return withOwnedSession(
    db,
    token,
    async (tx, session) => {
      const ownerId = session.userId;
      // Privileged workflows can require current authority even for a receipt
      // replay. The check shares the command's revocation/permission lock.
      if (beforeReplay) await beforeReplay(tx, ownerId);
      const prior = await tx.socialOperation.findUnique({
        where: { ownerId_key: { ownerId, key } }
      });
      if (prior) {
        if (prior.fingerprint !== fingerprint)
          throw new PortalError(
            409,
            "This retry key was already used for different work."
          );
        return prior.result as unknown as SocialReceipt;
      }
      if ((await tx.socialOperation.count({ where: { ownerId } })) >= 20000)
        throw new PortalError(
          429,
          "These saved changes need a storage review. Keep your unsent entries."
        );
      const result = await run(tx, ownerId);
      await tx.socialOperation.create({
        data: {
          ownerId,
          key,
          fingerprint,
          result: result as unknown as Prisma.InputJsonObject
        }
      });
      return result;
    },
    true
  );
}
