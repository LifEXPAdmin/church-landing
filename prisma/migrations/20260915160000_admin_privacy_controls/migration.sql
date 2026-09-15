ALTER TABLE "SupportCase" ADD COLUMN "adminVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("adminVersion">=0);
ALTER TABLE "CommunityReport" ADD COLUMN "adminVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("adminVersion">=0);
ALTER TABLE "ChurchClaim" ADD COLUMN "adminVersion" INTEGER NOT NULL DEFAULT 0 CHECK ("adminVersion">=0);
CREATE INDEX "SupportCase_adminGroupId_idx" ON "SupportCase"("adminGroupId");
CREATE INDEX "CommunityReport_adminGroupId_idx" ON "CommunityReport"("adminGroupId");
CREATE INDEX "ChurchClaim_adminGroupId_idx" ON "ChurchClaim"("adminGroupId");
CREATE FUNCTION protect_admin_operation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Admin operation receipts are immutable'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "AdminOperation_immutable" BEFORE UPDATE ON "AdminOperation"
  FOR EACH ROW EXECUTE FUNCTION protect_admin_operation_identity();
