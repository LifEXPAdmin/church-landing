import { newFounderWelcomeAt } from "./founder-config";
import { AccountError } from "./account-error";
export { AccountError } from "./account-error";
import {
  bindSignupFriendInvitation,
  finishVerifiedFriendInvitation
} from "./friend-invitations";
import {
  Prisma,
  PlatformRole,
  type AccountGrantPurpose,
  type PrismaClient
} from "@prisma/client";
import { activePublicAccount } from "./public-profile";
import { defaultProfileStyle, validProfileStyle } from "./profile-style";
import { isEligible } from "./portal-policy";
import { recordDiscoveryControl } from "./retention-controls";
import {
  isGoogleCredential,
  requireAccountCredential
} from "./account-credential";
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
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
      const created = await tx.platformUser.create({
        select: { id: true, email: true },
        data: {
          email,
          name,
          username,
          passwordHash,
          metricCreationMethod: "EMAIL",
          role: input.role as PlatformRole,
          pendingFounderWelcomeAt: newFounderWelcomeAt(),
          interests: []
        }
      });
      await bindSignupFriendInvitation(
        tx,
        created.id,
        input.friendInvitation,
        input.friendConsent
      );
      return { id: created.id, email: created.email };
    }, txOptions);
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
      suspendedAt: true,
      deactivatedAt: true
    }
  });
  if (
    !(await verifyPassword(password, user?.passwordHash ?? null)) ||
    !user ||
    user.suspendedAt ||
    user.deactivatedAt
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
      select: {
        credentialVersion: true,
        passwordHash: true,
        suspendedAt: true,
        deactivatedAt: true
      }
    });
    if (
      !current ||
      current.suspendedAt ||
      current.deactivatedAt ||
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
          dateFormat: true,
          timeFormat: true,
          website: true,
          interests: true,
          emailVerifiedAt: true,
          credentialVersion: true,
          suspendedAt: true,
          deactivatedAt: true,
          _count: {
            select: {
              posts: true,
              followers: { where: { follower: activePublicAccount } },
              following: { where: { following: activePublicAccount } }
            }
          }
        }
      }
    }
  });
  if (
    !session ||
    session.user.suspendedAt ||
    session.user.deactivatedAt ||
    session.expiresAt <= new Date() ||
    session.credentialVersion !== session.user.credentialVersion
  )
    return null;
  return session.user;
}

export async function updateAccountProfile(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>,
  expectedOwner?: string | null
) {
  const allowed = [
    "operation",
    "name",
    "role",
    "bio",
    "location",
    "locationAudience",
    "expectedLocationVersion",
    "website",
    "interests",
    "expectedVersion",
    "palette",
    "background",
    "sectionOrder",
    "introduction"
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new AccountError("profile");
  if (
    input.locationAudience !== undefined &&
    (!["ONLY_ME", "MEMBERS"].includes(String(input.locationAudience)) ||
      !Number.isSafeInteger(input.expectedVersion) ||
      !Number.isSafeInteger(input.expectedLocationVersion))
  )
    throw new AccountError("profile");
  // Older clients may omit the choice. New edits share the existing version
  // check, and cannot turn a self-description into an authority grant.
  if (
    input.role !== undefined &&
    (!Object.values(PlatformRole).includes(input.role as PlatformRole) ||
      !Number.isInteger(input.expectedVersion))
  )
    throw new AccountError("profile");
  const customized = [
    "palette",
    "background",
    "sectionOrder",
    "introduction"
  ].some((k) => input[k] !== undefined);
  if (
    (customized &&
      (!validProfileStyle(input) ||
        !Number.isInteger(input.expectedVersion))) ||
    (input.expectedVersion !== undefined &&
      (!Number.isInteger(input.expectedVersion) ||
        Number(input.expectedVersion) < 0))
  )
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
  if (!snapshot || (expectedOwner && expectedOwner !== snapshot.id))
    throw new AccountError("session");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    await lockUser(tx, snapshot.id);
    const current = await readAccountSession(tx, token);
    if (!current || current.id !== snapshot.id)
      throw new AccountError("session");
    const locationState = await tx.platformUser.findUniqueOrThrow({
      where: { id: current.id },
      select: {
        location: true,
        locationAudience: true,
        locationVersion: true,
        locationRecoveryRequired: true,
        suspendedAt: true,
        deactivatedAt: true,
        emailVerifiedAt: true,
        adultAcknowledgedAt: true,
        adultPolicyVersion: true
      }
    });
    // Legacy clients have no audience control. Preserve their ability to save
    // optional text, but never infer member disclosure for an ineligible owner.
    const locationAudience =
      input.locationAudience === undefined
        ? !isEligible(locationState) &&
          location &&
          location !== locationState.location
          ? "ONLY_ME"
          : locationState.locationAudience
        : String(input.locationAudience);
    if (
      input.expectedLocationVersion !== undefined &&
      input.expectedLocationVersion !== locationState.locationVersion
    )
      throw new AccountError("profile-conflict");
    const locationChanged =
      (location || null) !== locationState.location ||
      locationAudience !== locationState.locationAudience;
    if (
      locationAudience === "MEMBERS" &&
      !isEligible(locationState) &&
      ((locationChanged && !!location) || input.locationAudience === "MEMBERS")
    )
      throw new AccountError("profile-disclosure");
    // Restored records require an explicit versioned audience decision, even
    // when an older client supplies location text through this same endpoint.
    if (
      locationState.locationRecoveryRequired &&
      locationAudience === "MEMBERS" &&
      input.locationAudience !== "MEMBERS"
    )
      throw new AccountError("profile-conflict");
    const presentation = await tx.profilePresentation.findUnique({
      where: { userId: current.id }
    });
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== (presentation?.version ?? 0)
    )
      throw new AccountError("profile-conflict");
    const style = customized
      ? {
          palette: String(input.palette),
          background: String(input.background),
          sectionOrder: String(input.sectionOrder),
          introduction: String(input.introduction).trim()
        }
      : {
          palette: presentation?.palette ?? defaultProfileStyle.palette,
          background:
            presentation?.background ?? defaultProfileStyle.background,
          sectionOrder:
            presentation?.sectionOrder ?? defaultProfileStyle.sectionOrder,
          introduction: presentation?.introduction ?? ""
        };
    await tx.profilePresentation.upsert({
      where: { userId: current.id },
      create: { userId: current.id, ...style },
      update: { ...style, version: { increment: 1 } }
    });
    if (locationChanged || locationState.locationRecoveryRequired) {
      await recordDiscoveryControl(
        tx,
        "PROFILE_LOCATION",
        current.id,
        current.id,
        locationState.locationVersion + 1
      );
    }
    return tx.platformUser.update({
      where: { id: current.id },
      data: {
        name,
        ...(input.role !== undefined
          ? { role: input.role as PlatformRole }
          : {}),
        bio: bio || null,
        location: location || null,
        locationAudience,
        ...(locationChanged || locationState.locationRecoveryRequired
          ? {
              locationVersion: { increment: 1 },
              locationRecoveryRequired: false
            }
          : {}),
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
  await tx.platformEmailChange.deleteMany({ where: { userId } });
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
    (!isGoogleCredential(oldPassword) && validatePassword(oldPassword)) ||
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
      session.user.suspendedAt ||
      session.user.deactivatedAt ||
      session.expiresAt <= new Date() ||
      session.credentialVersion !== session.user.credentialVersion
    )
      throw new AccountError("session");
    await requireAccountCredential(tx, session, oldPassword, "change-password");
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
        deactivatedAt: true,
        email: true
      }
    });
    if (
      !current ||
      current.suspendedAt ||
      (purpose === "VERIFY_EMAIL" && current.deactivatedAt) ||
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
      (purpose === "VERIFY_EMAIL" && grant.user.deactivatedAt) ||
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
  if (purpose === "VERIFY_EMAIL") {
    try {
      await finishVerifiedFriendInvitation(db, snapshot.userId);
    } catch {
      console.error(JSON.stringify({ event: "signup_connection_pending" }));
    }
  }
}
