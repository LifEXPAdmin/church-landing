ALTER TABLE "ChurchPosition" ADD COLUMN "chartX" INTEGER, ADD COLUMN "chartY" INTEGER;
-- NULL keeps the existing auto-arranged view. No reporting or grants change.
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_chart_coordinates"
  CHECK (("chartX" IS NULL AND "chartY" IS NULL) OR
    ("chartX" IS NOT NULL AND "chartY" IS NOT NULL AND
     "chartX" BETWEEN 0 AND 100000 AND "chartY" BETWEEN 0 AND 100000 AND
     "chartX" % 20 = 0 AND "chartY" % 20 = 0));

CREATE TABLE "ChurchChartSave" (
  "requestKey" TEXT NOT NULL PRIMARY KEY,
  "churchId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "inputHash" TEXT NOT NULL,
  "resultVersion" INTEGER NOT NULL CHECK ("resultVersion" > 0),
  "changes" JSONB NOT NULL CHECK (jsonb_typeof("changes") = 'array'),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChurchChartSave_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ChurchChartSave_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ChurchChartSave_churchId_resultVersion_key" ON "ChurchChartSave"("churchId", "resultVersion");
CREATE INDEX "ChurchChartSave_churchId_createdAt_idx" ON "ChurchChartSave"("churchId", "createdAt");
