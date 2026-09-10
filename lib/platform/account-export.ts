import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { hashSessionToken } from "./auth";
import { requireAccountCredential } from "./account-credential";
import { projectListingData } from "./church-listing-data";

const EXPORT_SECONDS = 60;
const MAX_ROWS = 2000;
const MAX_BYTES = 10 * 1024 * 1024;
export class AccountExportError extends Error {
  code: "authorization" | "size";
  constructor(code: "authorization" | "size") {
    super("Account export unavailable");
    this.code = code;
  }
}
function signature(
  secret: string,
  session: string,
  version: number,
  value: string
) {
  return createHmac("sha256", secret)
    .update(
      `account-export-v1:${hashSessionToken(session)}:${version}:${value}`
    )
    .digest("base64url");
}
function checkProof(
  proof: unknown,
  token: string,
  version: number,
  secret: string
) {
  if (
    typeof proof !== "string" ||
    !/^\d{13}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(proof)
  )
    throw new AccountExportError("authorization");
  const [expires, nonce, actual] = proof.split(".");
  const time = Number(expires);
  if (
    time <= Date.now() ||
    time > Date.now() + EXPORT_SECONDS * 1000 ||
    !timingSafeEqual(
      Buffer.from(actual),
      Buffer.from(signature(secret, token, version, `${expires}.${nonce}`))
    )
  )
    throw new AccountExportError("authorization");
}
export async function prepareAccountExport(
  db: PrismaClient,
  token: unknown,
  password: unknown,
  secret: string
) {
  return withOwnedSession(db, token, async (tx, session) => {
    await requireAccountCredential(tx, session, password, "prepare-export");
    const expiresAt = Date.now() + EXPORT_SECONDS * 1000;
    const value = `${expiresAt}.${randomBytes(16).toString("base64url")}`;
    return {
      authorization: `${value}.${signature(secret, token as string, session.credentialVersion, value)}`,
      expiresAt: new Date(expiresAt).toISOString()
    };
  });
}

export async function downloadAccountExport(
  db: PrismaClient,
  token: unknown,
  proof: unknown,
  secret: string
) {
  return withOwnedSession(db, token, async (tx, session) => {
    checkProof(proof, token as string, session.credentialVersion, secret);
    const userId = session.userId;
    // Explicit projections are the export contract. Never serialize a complete
    // ORM account, session, capability, audit or related participant record.
    const account = await tx.platformUser.findUniqueOrThrow({
      where: { id: userId },
      select: {
        createdAt: true,
        updatedAt: true,
        name: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        role: true,
        bio: true,
        location: true,
        website: true,
        interests: true,
        adultAcknowledgedAt: true,
        adultPolicyVersion: true,
        googleIdentity: {
          select: { issuer: true, subject: true, createdAt: true }
        }
      }
    });
    const posts = await tx.platformPost.findMany({
      where: { authorId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        type: true,
        content: true,
        scripture: true
      }
    });
    const comments = await tx.platformPostComment.findMany({
      where: { authorId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { id: true, postId: true, createdAt: true, content: true }
    });
    const likes = await tx.platformPostLike.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { postId: true, createdAt: true }
    });
    const following = await tx.platformFollow.findMany({
      where: { followerId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { createdAt: true, following: { select: { username: true } } }
    });
    const churchConnections = await tx.churchConnection.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        state: true,
        createdAt: true,
        updatedAt: true,
        church: { select: { slug: true, name: true } },
        preference: {
          select: {
            listed: true,
            displayName: true,
            contactEmail: true,
            phone: true,
            emailAudience: true,
            phoneAudience: true
          }
        }
      }
    });
    const supportRequests = await tx.supportCase.findMany({
      where: { requesterId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        category: true,
        subject: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        coordinatorShare: { select: { createdAt: true, revokedAt: true } }
      }
    });
    const supportMessages = await tx.supportMessage.findMany({
      where: {
        authorId: userId,
        case: { requesterId: userId },
        redactedAt: null
      },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { caseId: true, body: true, createdAt: true }
    });
    const churchListings = (
      await tx.churchListingSubmission.findMany({
        where: { ownerId: userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          kind: true,
          status: true,
          data: true,
          reviewReason: true,
          createdAt: true,
          updatedAt: true,
          church: { select: { id: true, slug: true, name: true } }
        }
      })
    ).map((row) => ({ ...row, data: projectListingData(row.data) }));
    const collections = {
      churchListings,
      posts,
      comments,
      likes,
      following,
      churchConnections,
      supportRequests,
      supportMessages
    };
    if (Object.values(collections).some((rows) => rows.length > MAX_ROWS))
      throw new AccountExportError("size");
    const content = JSON.stringify(
      {
        format: "godschurches-account-export",
        version: 1,
        generatedAt: new Date().toISOString(),
        scope:
          "Your account profile and linked Google identity, authored community content, likes/following, church directory choices, your own church listing drafts/submissions and your own support submissions. Other people's content, staff/church operations, credentials, session data and security audit records are excluded. Reading preferences saved only on this browser are not in this account file.",
        account,
        ...collections
      },
      null,
      2
    );
    if (Buffer.byteLength(content, "utf8") > MAX_BYTES)
      throw new AccountExportError("size");
    checkProof(proof, token as string, session.credentialVersion, secret);
    return content;
  });
}
