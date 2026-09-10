-- AlterEnum
ALTER TYPE "ChurchCapability" ADD VALUE 'MANAGE_STRUCTURE';

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "structureVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ChurchPosition" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "requestKey" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchPositionAssignment" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ChurchPositionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChurchPosition_churchId_archivedAt_idx" ON "ChurchPosition"("churchId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchPosition_id_churchId_key" ON "ChurchPosition"("id", "churchId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchPosition_churchId_requestKey_key" ON "ChurchPosition"("churchId", "requestKey");

-- CreateIndex
CREATE INDEX "ChurchPositionAssignment_connectionId_revokedAt_idx" ON "ChurchPositionAssignment"("connectionId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchPositionAssignment_positionId_connectionId_key" ON "ChurchPositionAssignment"("positionId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchConnection_id_churchId_key" ON "ChurchConnection"("id", "churchId");

-- AddForeignKey
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_parentId_churchId_fkey" FOREIGN KEY ("parentId", "churchId") REFERENCES "ChurchPosition"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChurchPositionAssignment" ADD CONSTRAINT "ChurchPositionAssignment_positionId_churchId_fkey" FOREIGN KEY ("positionId", "churchId") REFERENCES "ChurchPosition"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChurchPositionAssignment" ADD CONSTRAINT "ChurchPositionAssignment_connectionId_churchId_fkey" FOREIGN KEY ("connectionId", "churchId") REFERENCES "ChurchConnection"("id", "churchId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Structural titles are independent of capability grants. Composite references
-- keep parent and assignment relationships inside a single church.
ALTER TABLE "Church" ADD CONSTRAINT "Church_nonnegative_structure_version" CHECK ("structureVersion" >= 0);
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_valid_text" CHECK (length(btrim("name")) >= 1 AND length(btrim("name")) <= 100 AND length("description") <= 3000 AND length("requestKey") >= 1 AND length("requestKey") <= 100);
ALTER TABLE "ChurchPosition" ADD CONSTRAINT "ChurchPosition_not_self_parent" CHECK ("parentId" IS NULL OR "parentId" <> "id");
CREATE FUNCTION church_position_acyclic() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    WITH RECURSIVE ancestors AS (
      SELECT p."id", p."parentId", ARRAY[p."id"] AS visited
      FROM "ChurchPosition" p WHERE p."id" = NEW."parentId"
      UNION ALL
      SELECT p."id", p."parentId", a.visited || p."id"
      FROM "ChurchPosition" p JOIN ancestors a ON p."id" = a."parentId"
      WHERE NOT p."id" = ANY(a.visited)
    ) SELECT 1 FROM ancestors WHERE "id" = NEW."id"
  ) THEN
    RAISE EXCEPTION 'Church positions cannot form a cycle' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER "ChurchPosition_acyclic"
AFTER INSERT OR UPDATE ON "ChurchPosition"
DEFERRABLE INITIALLY IMMEDIATE FOR EACH ROW EXECUTE FUNCTION church_position_acyclic();
