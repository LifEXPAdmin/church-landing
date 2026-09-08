import { PrismaClient } from "@prisma/client";
import { scryptSync } from "node:crypto";
const db = new PrismaClient();
if (
  !process.env.ACCOUNT_TEST_ISOLATED ||
  !process.env.DATABASE_URL?.includes("127.0.0.1:")
)
  throw new Error("Isolated DB required");
const hash = `scrypt:${"a".repeat(32)}:${scryptSync("Existing-password-1", "a".repeat(32), 64).toString("hex")}`;
await db.$executeRaw`INSERT INTO "PlatformUser" ("id", "updatedAt", "name", "username", "email", "passwordHash")
 VALUES ('fixture-legacy', NOW(), 'Synthetic Legacy', 'synthetic_legacy', 'legacy@example.test', NULL),
 ('fixture-existing', NOW(), 'Synthetic Existing', 'synthetic_existing', 'existing@example.test', ${hash})`;
await db.$executeRaw`INSERT INTO "PlatformPost" ("id", "updatedAt", "authorId", "content", "type") VALUES ('fixture-post', NOW(), 'fixture-existing', 'Synthetic testimony for isolated testing', 'TESTIMONY')`;
await db.$executeRaw`INSERT INTO "PlatformPostComment" ("id", "postId", "authorId", "content") VALUES ('fixture-comment', 'fixture-post', 'fixture-legacy', 'Synthetic comment')`;
await db.$executeRaw`INSERT INTO "PlatformFollow" ("id", "followerId", "followingId") VALUES ('fixture-follow', 'fixture-legacy', 'fixture-existing')`;
await db.$executeRaw`INSERT INTO "PlatformPostLike" ("id", "postId", "userId") VALUES ('fixture-like', 'fixture-post', 'fixture-legacy')`;
await db.$disconnect();
