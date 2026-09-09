import { Prisma, type PrismaClient } from "@prisma/client";
import { AccountError } from "./accounts";
import {
  hashSessionToken,
  validToken,
  validatePassword,
  verifyPassword
} from "./auth";

const sessionSelect = {
  id: true,
  userId: true,
  createdAt: true,
  expiresAt: true,
  userAgent: true,
  credentialVersion: true,
  user: {
    select: { credentialVersion: true, suspendedAt: true, passwordHash: true }
  }
} satisfies Prisma.PlatformSessionSelect;
type OwnedSession = Prisma.PlatformSessionGetPayload<{
  select: typeof sessionSelect;
}>;

export async function withOwnedSession<T>(
  db: PrismaClient,
  token: unknown,
  action: (tx: Prisma.TransactionClient, current: OwnedSession) => Promise<T>
) {
  if (!validToken(token)) throw new AccountError("session");
  const tokenHash = hashSessionToken(token);
  const snapshot = await db.platformSession.findUnique({
    where: { tokenHash },
    select: { userId: true }
  });
  if (!snapshot) throw new AccountError("session");
  return db.$transaction(
    async (tx) => {
      // Serialize with session issuance, password changes and other revocations.
      await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${snapshot.userId} FOR UPDATE`;
      const current = await tx.platformSession.findUnique({
        where: { tokenHash },
        select: sessionSelect
      });
      if (
        !current ||
        current.user.suspendedAt ||
        current.expiresAt <= new Date() ||
        current.credentialVersion !== current.user.credentialVersion
      )
        throw new AccountError("session");
      return action(tx, current);
    },
    { maxWait: 5000, timeout: 15000 }
  );
}

function approximateLabel(agent: string | null) {
  const ua = agent?.slice(0, 300) ?? "";
  const browser = /Edg(?:e|A|iOS)?\//i.test(ua)
    ? "Edge"
    : /OPR\//i.test(ua)
      ? "Opera"
      : /(?:Firefox|FxiOS)\//i.test(ua)
        ? "Firefox"
        : /(?:Chrome|CriOS)\//i.test(ua)
          ? "Chrome"
          : /Version\/.*Safari\//i.test(ua)
            ? "Safari"
            : "Browser";
  const device = /iPad/i.test(ua)
    ? "iPad"
    : /iPhone/i.test(ua)
      ? "iPhone"
      : /Android/i.test(ua)
        ? "Android"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/i.test(ua)
            ? "Mac"
            : /Linux/i.test(ua)
              ? "Linux"
              : "unknown device";
  return `${browser} on ${device}`;
}

export type AccountSessionList = {
  sessions: Array<{
    isCurrent: boolean;
    label: string;
    createdAt: string;
    expiresAt: string;
  }>;
  otherCount: number;
};

export async function listAccountSessions(
  db: PrismaClient,
  token: unknown
): Promise<AccountSessionList> {
  return withOwnedSession(db, token, async (tx, current) => {
    const where = {
      userId: current.userId,
      id: { not: current.id },
      expiresAt: { gt: new Date() },
      credentialVersion: current.credentialVersion
    };
    const others = await tx.platformSession.findMany({
      where,
      select: { createdAt: true, expiresAt: true, userAgent: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20
    });
    const otherCount = await tx.platformSession.count({ where });
    return {
      sessions: [current, ...others].map((session, index) => ({
        isCurrent: index === 0,
        label: approximateLabel(session.userAgent),
        createdAt: session.createdAt.toISOString(),
        expiresAt: session.expiresAt.toISOString()
      })),
      otherCount
    };
  });
}

export async function revokeOtherAccountSessions(
  db: PrismaClient,
  token: unknown,
  password: unknown
) {
  return withOwnedSession(db, token, async (tx, current) => {
    if (
      validatePassword(password) ||
      !(await verifyPassword(password, current.user.passwordHash))
    )
      throw new AccountError("credentials");
    // The owner and the retained session come only from the authenticated cookie.
    await tx.platformSession.deleteMany({
      where: { userId: current.userId, id: { not: current.id } }
    });
  });
}
