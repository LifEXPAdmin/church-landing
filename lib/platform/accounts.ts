import {
  Prisma,
  PlatformRole,
  type AccountGrantPurpose,
  type PrismaClient
} from "@prisma/client";
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  validToken,
  validatePassword,
  verifyPassword
} from "./auth";

export const SESSION_SECONDS = 60 * 60 * 24 * 30;
const txOptions = { maxWait: 5000, timeout: 15000 };
export class AccountError extends Error {
  code: "invalid" | "credentials" | "registration" | "session" | "grant";
  constructor(code: AccountError["code"]) {
    super(code);
    this.code = code;
  }
}
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string" || value.length > 254) return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
async function lockUser(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${id} FOR UPDATE`;
}
export async function registerAccount(
  db: PrismaClient,
  input: Record<string, unknown>
) {
  const email = normalizeEmail(input.email);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";
  if (
    !email ||
    name.length < 2 ||
    name.length > 100 ||
    !/^[a-z0-9_]{3,24}$/.test(username) ||
    typeof input.role !== "string" ||
    !Object.values(PlatformRole).includes(input.role as PlatformRole) ||
    validatePassword(input.password) ||
    input.password !== input.confirmPassword
  )
    throw new AccountError("invalid");
  const passwordHash = await hashPassword(input.password as string);
  try {
    // Insert only. Unique constraints settle duplicate/concurrent registrations without overwrites.
    await db.platformUser.create({
      data: {
        email,
        name,
        username,
        passwordHash,
        role: input.role as PlatformRole,
        bio: "I am exploring Church and The Revival.",
        interests: ["Prayer", "Community"]
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    )
      return;
    throw error;
  }
}

export async function authenticatePassword(
  db: PrismaClient,
  emailInput: unknown,
  password: unknown
) {
  const email = normalizeEmail(emailInput);
  if (!email || validatePassword(password))
    throw new AccountError("credentials");
  const user = await db.platformUser.findUnique({
    where: { email },
    select: {
      id: true,
      passwordHash: true,
      credentialVersion: true,
      suspendedAt: true
    }
  });
  if (
    !(await verifyPassword(password, user?.passwordHash ?? null)) ||
    !user ||
    user.suspendedAt
  )
    throw new AccountError("credentials");
  return user;
}

// Only called with a server-verified credential snapshot; never accept it from a request body.
export async function issueAuthenticatedSession(
  db: PrismaClient,
  credential: Awaited<ReturnType<typeof authenticatePassword>>,
  userAgent: string | null
) {
  return db.$transaction(async (tx) => {
    await lockUser(tx, credential.id);
    const current = await tx.platformUser.findUnique({
      where: { id: credential.id },
      select: { credentialVersion: true, passwordHash: true, suspendedAt: true }
    });
    if (
      !current ||
      current.suspendedAt ||
      current.credentialVersion !== credential.credentialVersion ||
      current.passwordHash !== credential.passwordHash
    )
      throw new AccountError("credentials");
    const token = createSessionToken();
    await tx.platformSession.create({
      data: {
        userId: credential.id,
        tokenHash: hashSessionToken(token),
        credentialVersion: current.credentialVersion,
        expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
        userAgent: userAgent?.slice(0, 300) ?? null
      }
    });
    return token;
  }, txOptions);
}
export async function loginAccount(
  db: PrismaClient,
  email: unknown,
  password: unknown,
  userAgent: string | null
) {
  return issueAuthenticatedSession(
    db,
    await authenticatePassword(db, email, password),
    userAgent
  );
}

export async function readAccountSession(db: PrismaClient, token: unknown) {
  if (!validToken(token)) return null;
  const session = await db.platformSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: {
      credentialVersion: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          role: true,
          bio: true,
          location: true,
          website: true,
          interests: true,
          emailVerifiedAt: true,
          credentialVersion: true,
          suspendedAt: true,
          _count: { select: { posts: true, followers: true, following: true } }
        }
      }
    }
  });
  if (
    !session ||
    session.user.suspendedAt ||
    session.expiresAt <= new Date() ||
    session.credentialVersion !== session.user.credentialVersion
  )
    return null;
  return session.user;
}
async function revokeAccountAccess(
  tx: Prisma.TransactionClient,
  userId: string
) {
  await tx.platformSession.deleteMany({ where: { userId } });
  await tx.platformAccountGrant.updateMany({
    where: { userId, consumedAt: null },
    data: { consumedAt: new Date() }
  });
}
export async function changeAccountPassword(
  db: PrismaClient,
  token: unknown,
  oldPassword: unknown,
  password: unknown,
  confirmation: unknown
) {
  if (!validToken(token)) throw new AccountError("session");
  if (
    validatePassword(oldPassword) ||
    validatePassword(password) ||
    password !== confirmation
  )
    throw new AccountError("invalid");
  const snapshot = await db.platformSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { userId: true }
  });
  if (!snapshot) throw new AccountError("session");
  await db.$transaction(async (tx) => {
    await lockUser(tx, snapshot.userId);
    const session = await tx.platformSession.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true }
    });
    if (
      !session ||
      session.expiresAt <= new Date() ||
      session.credentialVersion !== session.user.credentialVersion
    )
      throw new AccountError("session");
    if (!(await verifyPassword(oldPassword, session.user.passwordHash)))
      throw new AccountError("credentials");
    await tx.platformUser.update({
      where: { id: session.userId },
      data: {
        passwordHash: await hashPassword(password as string),
        credentialVersion: { increment: 1 }
      }
    });
    await revokeAccountAccess(tx, session.userId);
  }, txOptions);
}
export async function requestAccountGrant(
  db: PrismaClient,
  emailInput: unknown,
  purpose: AccountGrantPurpose,
  deliver: (
    email: string,
    purpose: AccountGrantPurpose,
    token: string
  ) => Promise<void>
) {
  const email = normalizeEmail(emailInput);
  if (!email) return;
  const user = await db.platformUser.findUnique({
    where: { email },
    select: { id: true }
  });
  if (!user) return;
  const token = createSessionToken();
  const grant = await db.$transaction(async (tx) => {
    await lockUser(tx, user.id);
    const current = await tx.platformUser.findUnique({
      where: { id: user.id },
      select: { credentialVersion: true, emailVerifiedAt: true }
    });
    if (!current || (purpose === "VERIFY_EMAIL" && current.emailVerifiedAt))
      return null;
    await tx.platformAccountGrant.deleteMany({
      where: { userId: user.id, expiresAt: { lt: new Date() } }
    });
    return tx.platformAccountGrant.create({
      data: {
        userId: user.id,
        purpose,
        tokenHash: hashSessionToken(token),
        credentialVersion: current.credentialVersion,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000)
      }
    });
  }, txOptions);
  if (grant) {
    try {
      await deliver(email, purpose, token);
    } catch {
      await db.platformAccountGrant.deleteMany({ where: { id: grant.id } });
    }
  }
}
export async function consumeAccountGrant(
  db: PrismaClient,
  token: unknown,
  purpose: AccountGrantPurpose,
  password?: unknown,
  confirmation?: unknown
) {
  if (!validToken(token)) throw new AccountError("grant");
  if (
    purpose === "RESET_PASSWORD" &&
    (validatePassword(password) || password !== confirmation)
  )
    throw new AccountError("invalid");
  const tokenHash = hashSessionToken(token);
  const snapshot = await db.platformAccountGrant.findUnique({
    where: { tokenHash },
    select: { userId: true }
  });
  if (!snapshot) throw new AccountError("grant");
  await db.$transaction(async (tx) => {
    await lockUser(tx, snapshot.userId);
    const grant = await tx.platformAccountGrant.findUnique({
      where: { tokenHash },
      include: { user: true }
    });
    if (
      !grant ||
      grant.purpose !== purpose ||
      grant.consumedAt ||
      grant.expiresAt <= new Date() ||
      grant.credentialVersion !== grant.user.credentialVersion
    )
      throw new AccountError("grant");
    await tx.platformAccountGrant.update({
      where: { id: grant.id },
      data: { consumedAt: new Date() }
    });
    if (purpose === "RESET_PASSWORD") {
      await tx.platformUser.update({
        where: { id: grant.userId },
        data: {
          passwordHash: await hashPassword(password as string),
          credentialVersion: { increment: 1 }
        }
      });
      await revokeAccountAccess(tx, grant.userId);
    } else {
      await tx.platformUser.update({
        where: { id: grant.userId },
        data: { emailVerifiedAt: new Date() }
      });
      await tx.platformAccountGrant.updateMany({
        where: {
          userId: grant.userId,
          purpose: "VERIFY_EMAIL",
          consumedAt: null
        },
        data: { consumedAt: new Date() }
      });
    }
  }, txOptions);
}
