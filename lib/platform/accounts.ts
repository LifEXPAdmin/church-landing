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
  code:
    | "invalid"
    | "credentials"
    | "registration"
    | "session"
    | "grant"
    | "handle-invalid"
    | "handle-taken"
    | "profile";
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
  if (!/^[a-z0-9_]{3,24}$/.test(username))
    throw new AccountError("handle-invalid");
  if (
    !email ||
    name.length < 2 ||
    name.length > 100 ||
    typeof input.role !== "string" ||
    !Object.values(PlatformRole).includes(input.role as PlatformRole) ||
    validatePassword(input.password) ||
    input.password !== input.confirmPassword
  )
    throw new AccountError("invalid");
  // Handles are public. Availability must not depend on a private email/handle pairing.
  if (
    await db.platformUser.findUnique({
      where: { username },
      select: { id: true }
    })
  )
    throw new AccountError("handle-taken");
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
        interests: []
      }
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Recheck after a concurrent insert, including providers with ambiguous P2002 metadata.
      if (
        await db.platformUser.findUnique({
          where: { username },
          select: { id: true }
        })
      )
        throw new AccountError("handle-taken");
      const target = error.meta?.target;
      const emailConflict =
        Array.isArray(target) && target.length === 1 && target[0] === "email";
      const ambiguous = !Array.isArray(target) || target.length === 0;
      if (
        (emailConflict || ambiguous) &&
        (await db.platformUser.findUnique({
          where: { email },
          select: { id: true }
        }))
      )
        return;
    }
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

export async function readAccountSession(
  db: PrismaClient | Prisma.TransactionClient,
  token: unknown
) {
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

export async function updateAccountProfile(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  const allowed = [
    "operation",
    "name",
    "bio",
    "location",
    "website",
    "interests"
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new AccountError("profile");
  const field = (key: string, maximum: number) => {
    const value = input[key] ?? "";
    if (typeof value !== "string" || value.trim().length > maximum)
      throw new AccountError("profile");
    return value.trim();
  };
  const name = field("name", 100);
  const bio = field("bio", 500);
  const location = field("location", 80);
  const website = field("website", 120);
  const interests = field("interests", 334)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (
    name.length < 2 ||
    interests.length > 8 ||
    interests.some((item) => item.length > 40)
  )
    throw new AccountError("profile");
  if (website) {
    try {
      const url = new URL(website);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new AccountError("profile");
    }
  }
  const snapshot = await readAccountSession(db, token);
  if (!snapshot) throw new AccountError("session");
  return db.$transaction(async (tx) => {
    await lockUser(tx, snapshot.id);
    const current = await readAccountSession(tx, token);
    if (!current || current.id !== snapshot.id)
      throw new AccountError("session");
    return tx.platformUser.update({
      where: { id: current.id },
      data: {
        name,
        bio: bio || null,
        location: location || null,
        website: website || null,
        interests
      },
      select: { username: true }
    });
  }, txOptions);
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
      select: {
        credentialVersion: true,
        emailVerifiedAt: true,
        suspendedAt: true,
        email: true
      }
    });
    if (
      !current ||
      current.suspendedAt ||
      current.email !== email ||
      (purpose === "VERIFY_EMAIL" && current.emailVerifiedAt)
    )
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
      throw new Error("Account delivery failed");
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
      grant.user.suspendedAt ||
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
