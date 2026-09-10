-- AlterTable
ALTER TABLE "ChurchPosition" ADD COLUMN     "roleTemplateId" TEXT,
ADD COLUMN     "roleTemplateVersion" INTEGER;

-- CreateTable
CREATE TABLE "ChurchRoleTemplate" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchRoleTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchRoleRevision" (
    "templateId" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "starterId" TEXT,
    "presetKey" TEXT NOT NULL,
    "presetVersion" INTEGER NOT NULL,
    "recommendations" "ChurchCapability"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChurchRoleRevision_pkey" PRIMARY KEY ("templateId","churchId","version")
);

-- CreateIndex
CREATE INDEX "ChurchRoleTemplate_churchId_archivedAt_idx" ON "ChurchRoleTemplate"("churchId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchRoleTemplate_id_churchId_key" ON "ChurchRoleTemplate"("id", "churchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchRoleTemplate_churchId_requestKey_key" ON "ChurchRoleTemplate"("churchId", "requestKey");

-- AddForeignKey
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_roleTemplateId_churchId_roleTemplateVersion_fkey" FOREIGN KEY ("roleTemplateId", "churchId", "roleTemplateVersion") REFERENCES "ChurchRoleRevision"("templateId", "churchId", "version") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChurchRoleTemplate" ADD CONSTRAINT "ChurchRoleTemplate_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchRoleRevision" ADD CONSTRAINT "ChurchRoleRevision_templateId_churchId_fkey" FOREIGN KEY ("templateId", "churchId") REFERENCES "ChurchRoleTemplate"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Published positions and appointments retain their IDs, edges and grants.
-- Archived titles keep their historical revisions; names can be reused explicitly.
CREATE UNIQUE INDEX "ChurchRoleTemplate_active_name" ON "ChurchRoleTemplate" ("churchId", "normalizedName") WHERE "archivedAt" IS NULL;
ALTER TABLE "ChurchRoleTemplate" ADD CONSTRAINT "ChurchRoleTemplate_valid" CHECK ("version" > 0 AND length("normalizedName") BETWEEN 1 AND 100 AND length("requestKey") BETWEEN 1 AND 100);
ALTER TABLE "ChurchRoleRevision" ALTER COLUMN "recommendations" SET NOT NULL;
ALTER TABLE "ChurchRoleRevision" ADD CONSTRAINT "ChurchRoleRevision_valid" CHECK ("version" > 0 AND "presetVersion" > 0 AND "presetKey" IN ('A','P','C','M','D','E','W','G') AND length(btrim("name")) BETWEEN 1 AND 100 AND length("description") <= 500 AND length("responsibilities") <= 3000 AND cardinality("recommendations") <= 10);
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_complete_role_reference" CHECK (("roleTemplateId" IS NULL AND "roleTemplateVersion" IS NULL) OR ("roleTemplateId" IS NOT NULL AND "roleTemplateVersion" IS NOT NULL));
