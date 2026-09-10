-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "crop" JSONB;

-- CreateTable
CREATE TABLE "ProfilePresentation" (
    "userId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "palette" TEXT NOT NULL DEFAULT 'sage',
    "background" TEXT NOT NULL DEFAULT 'plain',
    "sectionOrder" TEXT NOT NULL DEFAULT 'about-first',
    "introduction" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ProfilePresentation_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "ProfilePresentation" ADD CONSTRAINT "ProfilePresentation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfilePresentation" ADD CONSTRAINT "ProfilePresentation_values" CHECK (
  version > 0 AND palette IN ('sage','blue','warm') AND background IN ('plain','soft','lines')
  AND "sectionOrder" IN ('about-first','posts-first') AND char_length(introduction) <= 1000
);
