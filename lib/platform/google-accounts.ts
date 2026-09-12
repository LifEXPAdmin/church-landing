import { Prisma, type PrismaClient } from "@prisma/client";
import { SESSION_SECONDS } from "./accounts";
import { AccountError } from "./account-error";
import { withOwnedSession } from "./account-sessions";
import {
  AccountLifecycleError,
  reactivateVerifiedAccount
} from "./account-lifecycle";
import {
  isRecentAuthenticationPurpose,
  requireAccountCredential,
  type RecentAuthenticationPurpose
} from "./account-credential";
import { safeAccountReturn } from "./account-entry";
import {
  createSessionToken,
  hashSessionToken,
  validToken,
  validatePassword,
  verifyPassword,
  usablePasswordHash
} from "./auth";
import { ADULT_POLICY } from "./portal-types";
import {
  GOOGLE_ISSUER,
  GoogleAccountError,
  exchangeGoogleCode,
  googleCodeVerifier,
  type GoogleConfig,
  type VerifiedGoogleIdentity
} from "./google-provider";

const ATTEMPT_MS = 10 * 60_000;
const RECENT_MS = 5 * 60_000;
const txOptions = { maxWait: 5000, timeout: 15000 };
type Tx = Prisma.TransactionClient;
type LinkProof = { sessionToken: unknown; password: unknown };

export async function beginGoogleReauthentication(
  db: PrismaClient,
  sessionToken: unknown,
  browserToken: string,
  purpose: RecentAuthenticationPurpose,
  next: unknown
) {
  if (!validToken(browserToken) || !isRecentAuthenticationPurpose(purpose))
    throw new GoogleAccountError();
  const state = createSessionToken();
  const nonce = createSessionToken();
  await withOwnedSession(
    db,
    sessionToken,
    async (tx, current) => {
      if (
        !(await tx.platformGoogleIdentity.findUnique({
          where: { userId: current.userId },
          select: { id: true }
        }))
      )
        throw new GoogleAccountError();
      await tx.platformRecentAuthentication.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      await tx.platformGoogleAttempt.create({
        data: {
          stateHash: hashSessionToken(state),
          browserHash: hashSessionToken(browserToken),
          nonceHash: hashSessionToken(nonce),
          returnTo: safeAccountReturn(next),
          expiresAt: new Date(Date.now() + ATTEMPT_MS),
          linkUserId: current.userId,
          linkSessionId: current.id,
          credentialVersion: current.credentialVersion,
          reauthPurpose: purpose
        }
      });
    },
    true
  );
  return { state, nonce };
}

// The HTTP layer must enforce exact origin, rate limits and HttpOnly browser
// cookies. All returned raw tokens are server response work, never page props.
export async function beginGoogleAttempt(
  db: PrismaClient,
  browserToken: string,
  next: unknown,
  link?: LinkProof
) {
  if (!validToken(browserToken)) throw new GoogleAccountError();
  const state = createSessionToken();
  const nonce = createSessionToken();
  const data = {
    stateHash: hashSessionToken(state),
    browserHash: hashSessionToken(browserToken),
    nonceHash: hashSessionToken(nonce),
    returnTo: safeAccountReturn(next),
    expiresAt: new Date(Date.now() + ATTEMPT_MS)
  };
  // Expired proofs contain no provider tokens and can no longer complete.
  await db.platformGoogleAttempt.deleteMany({
    where: { expiresAt: { lt: new Date() } }
  });
  if (link) {
    await withOwnedSession(
      db,
      link.sessionToken,
      async (tx, current) => {
        if (
          validatePassword(link.password) ||
          !(await verifyPassword(link.password, current.user.passwordHash))
        )
          throw new AccountError("credentials");
        await tx.platformGoogleAttempt.create({
          data: {
            ...data,
            linkUserId: current.userId,
            linkSessionId: current.id,
            credentialVersion: current.credentialVersion
          }
        });
      },
      true
    );
  } else {
    await db.platformGoogleAttempt.create({ data });
  }
  return { state, nonce };
}

async function gated<T>(db: PrismaClient, action: (tx: Tx) => Promise<T>) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(730221, 2)`;
    return action(tx);
  }, txOptions);
}
async function activeUser(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.platformUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      credentialVersion: true,
      suspendedAt: true,
      deactivatedAt: true
    }
  });
  if (!user || user.suspendedAt || user.deactivatedAt)
    throw new GoogleAccountError();
  return user;
}
async function session(tx: Tx, userId: string, userAgent: string | null) {
  const user = await activeUser(tx, userId);
  const token = createSessionToken();
  await tx.platformSession.create({
    data: {
      userId,
      tokenHash: hashSessionToken(token),
      credentialVersion: user.credentialVersion,
      expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000),
      userAgent: userAgent?.slice(0, 300) ?? null
    }
  });
  return token;
}
const identityWhere = (subject: string) => ({
  issuer_subject: { issuer: GOOGLE_ISSUER, subject }
});

type AttemptResult =
  | { kind: "signed-in"; token: string; next: string }
  | { kind: "linked"; next: string }
  | {
      kind: "reauthenticated";
      recentToken: string;
      purpose: RecentAuthenticationPurpose;
      next: string;
    }
  | { kind: "reactivate"; reactivationToken: string; next: string }
  | { kind: "signup"; signupToken: string; next: string }
  | { kind: "link-required"; next: string };

export async function finishGoogleAttempt(
  db: PrismaClient,
  config: GoogleConfig,
  input: {
    state: unknown;
    browserToken: unknown;
    code: unknown;
    sessionToken?: unknown;
    userAgent?: string | null;
  },
  // Test seam belongs only to trusted server code. No route may select this adapter.
  exchange: (
    config: GoogleConfig,
    code: string,
    verifier: string,
    nonceHash: string
  ) => Promise<VerifiedGoogleIdentity> = exchangeGoogleCode
): Promise<AttemptResult> {
  if (
    !validToken(input.state) ||
    !validToken(input.browserToken) ||
    typeof input.code !== "string" ||
    !input.code ||
    input.code.length > 2048
  )
    throw new GoogleAccountError();
  const stateHash = hashSessionToken(input.state);
  const browserHash = hashSessionToken(input.browserToken);
  const pending = await db.platformGoogleAttempt.findUnique({
    where: { stateHash }
  });
  if (
    !pending ||
    pending.browserHash !== browserHash ||
    pending.consumedAt ||
    pending.expiresAt <= new Date()
  )
    throw new GoogleAccountError();
  const claim = await exchange(
    config,
    input.code,
    googleCodeVerifier(input.browserToken, input.state),
    pending.nonceHash
  );
  return gated(db, async (tx) => {
    // Only one successful callback can consume this browser-bound attempt.
    const consumed = await tx.platformGoogleAttempt.updateMany({
      where: {
        id: pending.id,
        browserHash,
        consumedAt: null,
        expiresAt: { gt: new Date() }
      },
      data: { consumedAt: new Date() }
    });
    if (consumed.count !== 1) throw new GoogleAccountError();
    const identity = await tx.platformGoogleIdentity.findUnique({
      where: identityWhere(claim.subject)
    });
    if (pending.linkUserId) {
      const owner = await activeUser(tx, pending.linkUserId);
      const current = validToken(input.sessionToken)
        ? await tx.platformSession.findUnique({
            where: { tokenHash: hashSessionToken(input.sessionToken) },
            select: {
              id: true,
              userId: true,
              credentialVersion: true,
              expiresAt: true
            }
          })
        : null;
      if (
        !current ||
        current.id !== pending.linkSessionId ||
        current.userId !== pending.linkUserId ||
        current.credentialVersion !== pending.credentialVersion ||
        current.credentialVersion !== owner.credentialVersion ||
        current.expiresAt <= new Date()
      )
        throw new GoogleAccountError();
      if (pending.reauthPurpose) {
        if (
          !isRecentAuthenticationPurpose(pending.reauthPurpose) ||
          !identity ||
          identity.userId !== current.userId
        )
          throw new GoogleAccountError();
        const recentToken = createSessionToken();
        const data = {
          tokenHash: hashSessionToken(recentToken),
          credentialVersion: current.credentialVersion,
          googleIdentityId: identity.id,
          userId: current.userId,
          expiresAt: new Date(Date.now() + RECENT_MS),
          createdAt: new Date()
        };
        await tx.platformRecentAuthentication.upsert({
          where: {
            sessionId_purpose: {
              sessionId: current.id,
              purpose: pending.reauthPurpose
            }
          },
          create: {
            ...data,
            sessionId: current.id,
            purpose: pending.reauthPurpose
          },
          update: data
        });
        await tx.platformGoogleAttempt.update({
          where: { id: pending.id },
          data: { completedAt: new Date() }
        });
        return {
          kind: "reauthenticated",
          recentToken,
          purpose: pending.reauthPurpose,
          next: pending.returnTo
        };
      }
      const own = await tx.platformGoogleIdentity.findUnique({
        where: { userId: current.userId }
      });
      if (
        (identity && identity.userId !== current.userId) ||
        (own && own.subject !== claim.subject)
      )
        throw new GoogleAccountError();
      if (!identity)
        await tx.platformGoogleIdentity.create({
          data: {
            issuer: GOOGLE_ISSUER,
            subject: claim.subject,
            userId: current.userId
          }
        });
      await tx.platformGoogleAttempt.update({
        where: { id: pending.id },
        data: { completedAt: new Date() }
      });
      return { kind: "linked", next: pending.returnTo };
    }
    if (identity) {
      await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${identity.userId} FOR UPDATE`;
      const account = await tx.platformUser.findUnique({
        where: { id: identity.userId },
        select: {
          suspendedAt: true,
          deactivatedAt: true,
          credentialVersion: true
        }
      });
      if (!account || account.suspendedAt) throw new GoogleAccountError();
      if (account.deactivatedAt) {
        const reactivationToken = createSessionToken();
        await tx.platformGoogleAttempt.update({
          where: { id: pending.id },
          data: {
            reactivationTokenHash: hashSessionToken(reactivationToken),
            linkUserId: identity.userId,
            subject: identity.subject,
            credentialVersion: account.credentialVersion
          }
        });
        return {
          kind: "reactivate",
          reactivationToken,
          next: pending.returnTo
        };
      }
      const token = await session(tx, identity.userId, input.userAgent ?? null);
      await tx.platformGoogleAttempt.update({
        where: { id: pending.id },
        data: { completedAt: new Date() }
      });
      // A changed Google email never modifies the local account/recovery email.
      return { kind: "signed-in", token, next: pending.returnTo };
    }
    if (
      await tx.platformUser.findUnique({
        where: { email: claim.email },
        select: { id: true }
      })
    ) {
      await tx.platformGoogleAttempt.update({
        where: { id: pending.id },
        data: { completedAt: new Date() }
      });
      return { kind: "link-required", next: pending.returnTo };
    }
    const signupToken = createSessionToken();
    await tx.platformGoogleAttempt.update({
      where: { id: pending.id },
      data: {
        signupTokenHash: hashSessionToken(signupToken),
        subject: claim.subject,
        email: claim.email,
        emailAuthoritative: claim.emailAuthoritative
      }
    });
    return { kind: "signup", signupToken, next: pending.returnTo };
  });
}

export async function finishGoogleSignup(
  db: PrismaClient,
  browserToken: unknown,
  signupToken: unknown,
  input: { name?: unknown; username?: unknown; adultAcknowledged?: unknown },
  userAgent: string | null
) {
  if (!validToken(browserToken) || !validToken(signupToken))
    throw new GoogleAccountError();
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const username =
    typeof input.username === "string"
      ? input.username.trim().toLowerCase()
      : "";
  if (
    name.length < 2 ||
    name.length > 100 ||
    !/^[a-z0-9_]{3,24}$/.test(username) ||
    input.adultAcknowledged !== true
  )
    throw new GoogleAccountError();
  try {
    return await gated(db, async (tx) => {
      const proof = await tx.platformGoogleAttempt.findUnique({
        where: { signupTokenHash: hashSessionToken(signupToken) }
      });
      if (
        !proof ||
        proof.browserHash !== hashSessionToken(browserToken) ||
        !proof.consumedAt ||
        proof.completedAt ||
        proof.expiresAt <= new Date() ||
        !proof.subject ||
        !proof.email ||
        proof.linkUserId
      )
        throw new GoogleAccountError();
      const existing = await tx.platformGoogleIdentity.findUnique({
        where: identityWhere(proof.subject)
      });
      let userId = existing?.userId;
      if (!userId) {
        // Transactional unique constraints settle a racing password registration.
        // Existing password and passwordless accounts are never claimed by email.
        if (
          await tx.platformUser.findUnique({
            where: { email: proof.email },
            select: { id: true }
          })
        )
          throw new GoogleAccountError();
        if (
          await tx.platformUser.findUnique({
            where: { username },
            select: { id: true }
          })
        )
          throw new AccountError("handle-taken");
        const user = await tx.platformUser.create({
          data: {
            name,
            username,
            email: proof.email,
            role: "BELIEVER",
            interests: [],
            adultAcknowledgedAt: new Date(),
            adultPolicyVersion: ADULT_POLICY,
            emailVerifiedAt: proof.emailAuthoritative ? new Date() : null
          },
          select: { id: true }
        });
        userId = user.id;
        await tx.platformGoogleIdentity.create({
          data: { userId, issuer: GOOGLE_ISSUER, subject: proof.subject }
        });
      }
      const token = await session(tx, userId, userAgent);
      await tx.platformGoogleAttempt.update({
        where: { id: proof.id },
        data: {
          completedAt: new Date(),
          signupTokenHash: null,
          email: null,
          subject: null
        }
      });
      return { token, next: proof.returnTo };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      if (
        Array.isArray(error.meta?.target) &&
        error.meta.target.includes("username")
      )
        throw new AccountError("handle-taken");
      throw new GoogleAccountError();
    }
    throw error;
  }
}

export async function unlinkGoogleIdentity(
  db: PrismaClient,
  token: unknown,
  password: unknown
) {
  return withOwnedSession(
    db,
    token,
    async (tx, current) => {
      // A passwordless account cannot remove its only usable sign-in method.
      if (!usablePasswordHash(current.user.passwordHash))
        throw new AccountError("credentials");
      await requireAccountCredential(tx, current, password, "unlink-google");
      const removed = await tx.platformGoogleIdentity.deleteMany({
        where: { userId: current.userId }
      });
      if (!removed.count) return;
      const credentialVersion = current.credentialVersion + 1;
      await tx.platformUser.update({
        where: { id: current.userId },
        data: { credentialVersion }
      });
      await tx.platformSession.deleteMany({
        where: { userId: current.userId, id: { not: current.id } }
      });
      await tx.platformSession.update({
        where: { id: current.id },
        data: { credentialVersion }
      });
      await tx.platformAccountGrant.updateMany({
        where: { userId: current.userId, consumedAt: null },
        data: { consumedAt: new Date() }
      });
      await tx.platformEmailChange.deleteMany({
        where: { userId: current.userId }
      });
      await tx.platformGoogleAttempt.deleteMany({
        where: { linkUserId: current.userId }
      });
    },
    true
  );
}

export async function finishGoogleReactivation(
  db: PrismaClient,
  browserToken: unknown,
  reactivationToken: unknown,
  confirmed: unknown
) {
  if (confirmed !== true) throw new AccountLifecycleError("confirmation");
  if (!validToken(browserToken) || !validToken(reactivationToken))
    throw new GoogleAccountError();
  return gated(db, async (tx) => {
    const proof = await tx.platformGoogleAttempt.findUnique({
      where: { reactivationTokenHash: hashSessionToken(reactivationToken) }
    });
    if (
      !proof ||
      proof.browserHash !== hashSessionToken(browserToken) ||
      !proof.consumedAt ||
      proof.completedAt ||
      proof.expiresAt <= new Date() ||
      !proof.linkUserId ||
      !proof.subject ||
      proof.linkSessionId ||
      proof.reauthPurpose
    )
      throw new GoogleAccountError();
    await tx.$queryRaw`SELECT "id" FROM "PlatformUser" WHERE "id" = ${proof.linkUserId} FOR UPDATE`;
    const current = await tx.platformUser.findUnique({
      where: { id: proof.linkUserId },
      select: {
        id: true,
        suspendedAt: true,
        deactivatedAt: true,
        credentialVersion: true
      }
    });
    const identity = await tx.platformGoogleIdentity.findUnique({
      where: identityWhere(proof.subject)
    });
    if (
      !current ||
      current.suspendedAt ||
      !current.deactivatedAt ||
      current.credentialVersion !== proof.credentialVersion ||
      identity?.userId !== current.id
    )
      throw new GoogleAccountError();
    await reactivateVerifiedAccount(tx, current.id);
    await tx.platformGoogleAttempt.update({
      where: { id: proof.id },
      data: {
        completedAt: new Date(),
        reactivationTokenHash: null,
        subject: null
      }
    });
    return { next: proof.returnTo };
  });
}

export async function googleSignInMethods(db: PrismaClient, token: unknown) {
  return withOwnedSession(db, token, accountSignInMethods);
}

/** Read only inside the existing owner/session transaction. Never expose hashes. */
export async function accountSignInMethods(
  tx: Prisma.TransactionClient,
  current: { userId: string; user: { passwordHash: string | null } }
) {
  return {
    password: usablePasswordHash(current.user.passwordHash),
    google: !!(await tx.platformGoogleIdentity.findUnique({
      where: { userId: current.userId },
      select: { id: true }
    }))
  };
}
