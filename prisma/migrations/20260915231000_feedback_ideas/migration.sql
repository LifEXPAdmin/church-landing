ALTER TYPE "OperatorCapability" ADD VALUE 'MANAGE_PRODUCT_FEEDBACK';
CREATE TABLE "FeedbackIdea" (
 id TEXT PRIMARY KEY,
 "sourceCaseId" TEXT NOT NULL REFERENCES "FeedbackSubmission"("caseId") ON DELETE RESTRICT ON UPDATE NO ACTION,
 "reviewedSharingVersion" INTEGER NOT NULL CHECK ("reviewedSharingVersion">0),
 "reviewedGrantId" TEXT NOT NULL REFERENCES "PlatformOperatorGrant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version INTEGER NOT NULL DEFAULT 1 CHECK (version>0),
 title TEXT NOT NULL CHECK (length(title) BETWEEN 3 AND 120),
 summary TEXT NOT NULL CHECK (length(summary) BETWEEN 3 AND 1600),
 status TEXT NOT NULL DEFAULT 'CONSIDERING' CHECK (status IN ('CONSIDERING','PLANNED','BUILDING','TESTING','RELEASED','NOT_NOW')),
 explanation TEXT NOT NULL CHECK (length(explanation) BETWEEN 3 AND 1000),
 "releaseId" TEXT,
 "publishedAt" TIMESTAMP(3), "withdrawnAt" TIMESTAMP(3),
 "mergedIntoId" TEXT REFERENCES "FeedbackIdea"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CHECK ((status='RELEASED')=("releaseId" IS NOT NULL)),
 CHECK ("mergedIntoId" IS NULL OR "mergedIntoId"<>id)
);
CREATE UNIQUE INDEX "FeedbackIdea_sourceCaseId_key" ON "FeedbackIdea"("sourceCaseId");
CREATE INDEX "FeedbackIdea_publishedAt_updatedAt_id_idx" ON "FeedbackIdea"("publishedAt","updatedAt",id);
CREATE INDEX "FeedbackIdea_mergedIntoId_idx" ON "FeedbackIdea"("mergedIntoId");
CREATE TABLE "FeedbackIdeaVote" (
 "ideaId" TEXT NOT NULL REFERENCES "FeedbackIdea"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 active BOOLEAN NOT NULL DEFAULT true, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY("ideaId","userId")
);
CREATE INDEX "FeedbackIdeaVote_userId_idx" ON "FeedbackIdeaVote"("userId");
CREATE TABLE "FeedbackIdeaSubscription" (
 "ideaId" TEXT NOT NULL REFERENCES "FeedbackIdea"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 "inAppSince" TIMESTAMP(3), "emailSince" TIMESTAMP(3), "pushSince" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY("ideaId","userId")
);
CREATE INDEX "FeedbackIdeaSubscription_userId_idx" ON "FeedbackIdeaSubscription"("userId");
CREATE TABLE "FeedbackIdeaEvent" (
 id TEXT PRIMARY KEY,
 "ideaId" TEXT NOT NULL REFERENCES "FeedbackIdea"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 version INTEGER NOT NULL CHECK(version>0),
 "actorId" TEXT NOT NULL REFERENCES "PlatformUser"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "operatorGrantId" TEXT NOT NULL REFERENCES "PlatformOperatorGrant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 "operatorGrantVersion" INTEGER NOT NULL CHECK("operatorGrantVersion">0),
 action TEXT NOT NULL CHECK(action IN ('PUBLISH','EDIT','STATUS','MERGE','UNMERGE','WITHDRAW')),
 "fromState" TEXT, "toState" TEXT NOT NULL, explanation TEXT NOT NULL,
 "releaseId" TEXT, "fromMergedIntoId" TEXT, "toMergedIntoId" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "FeedbackIdeaEvent_ideaId_version_key" ON "FeedbackIdeaEvent"("ideaId",version);
CREATE INDEX "FeedbackIdeaEvent_createdAt_idx" ON "FeedbackIdeaEvent"("createdAt");
