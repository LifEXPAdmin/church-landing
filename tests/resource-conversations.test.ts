import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { assertPortalTestDatabase } from "./seed-portal";
import { seedVolunteerApplications } from "./seed-volunteer-applications";
import { readComments } from "../lib/platform/comment-reads";

const db = new PrismaClient();
before(() => assertPortalTestDatabase(db));
after(() => db.$disconnect());

test("an embedded discussion read rejects a different original account in its permission transaction", async () => {
  const f = await seedVolunteerApplications(db, false);
  await assert.rejects(
    readComments(db, f.ada.token, { postId: f.opportunityPost.id }, f.blake.id),
    /sign-in changed/
  );
});
