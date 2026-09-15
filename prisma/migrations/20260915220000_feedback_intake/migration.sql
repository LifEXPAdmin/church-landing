CREATE TABLE "FeedbackSubmission" (
  "caseId" TEXT PRIMARY KEY REFERENCES "SupportCase"(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('GENERAL','BUG','SUGGESTION')),
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  "entryPoint" TEXT NOT NULL DEFAULT 'VOLUNTARY' CHECK ("entryPoint" IN ('VOLUNTARY','PROMPT')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  "sharingVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("sharingVersion" > 0),
  "contactAllowed" BOOLEAN NOT NULL DEFAULT false,
  "contactInApp" BOOLEAN NOT NULL DEFAULT false,
  "contactEmail" BOOLEAN NOT NULL DEFAULT false,
  "contactPush" BOOLEAN NOT NULL DEFAULT false,
  "allowIdea" BOOLEAN NOT NULL DEFAULT false,
  "publicAttribution" BOOLEAN NOT NULL DEFAULT false,
  "contextRelease" TEXT,
  "contextDevice" TEXT CHECK ("contextDevice" IN ('UNKNOWN','PHONE','TABLET','COMPUTER')),
  "contextBrowser" TEXT CHECK ("contextBrowser" IN ('UNKNOWN','SAFARI','CHROME','EDGE','FIREFOX','OTHER')),
  "contextErrorRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "redactedAt" TIMESTAMP(3),
  CONSTRAINT "Feedback_contact_choice" CHECK (
    "contactAllowed" = ("contactInApp" OR "contactEmail" OR "contactPush")
  ),
  CONSTRAINT "Feedback_publication_choice" CHECK (
    (NOT "publicAttribution" OR "allowIdea") AND (NOT "allowIdea" OR kind='SUGGESTION')
  ),
  CONSTRAINT "Feedback_context_release" CHECK (
    "contextRelease" IS NULL OR "contextRelease" ~ '^20[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]{1,4}$'
  ),
  CONSTRAINT "Feedback_context_reference" CHECK (
    "contextErrorRef" IS NULL OR "contextErrorRef" ~ '^[A-Z0-9][A-Z0-9_-]{2,47}$'
  )
);
CREATE INDEX "FeedbackSubmission_kind_createdAt_idx" ON "FeedbackSubmission"(kind,"createdAt");
CREATE INDEX "FeedbackSubmission_entryPoint_createdAt_idx" ON "FeedbackSubmission"("entryPoint","createdAt");
