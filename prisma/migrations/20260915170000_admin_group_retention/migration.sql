-- A departed source must not leave shared free text behind, including when
-- native retention deletes the source directly. Opaque audit references remain.
CREATE FUNCTION clear_departed_admin_group() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE departed text;
BEGIN
  departed := OLD."adminGroupId";
  IF departed IS NULL THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."adminGroupId" IS NOT DISTINCT FROM departed THEN RETURN NULL; END IF;
  END IF;
  UPDATE "AdminCaseGroup" SET title='[Group details removed.]',"engineeringUrl"='' WHERE id=departed;
  DELETE FROM "AdminCaseGroup" g WHERE g.id=departed
    AND NOT EXISTS (SELECT 1 FROM "SupportCase" s WHERE s."adminGroupId"=g.id)
    AND NOT EXISTS (SELECT 1 FROM "CommunityReport" r WHERE r."adminGroupId"=g.id)
    AND NOT EXISTS (SELECT 1 FROM "ChurchClaim" c WHERE c."adminGroupId"=g.id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER "SupportCase_admin_group_retention" AFTER DELETE OR UPDATE OF "adminGroupId" ON "SupportCase" FOR EACH ROW EXECUTE FUNCTION clear_departed_admin_group();
CREATE TRIGGER "CommunityReport_admin_group_retention" AFTER DELETE OR UPDATE OF "adminGroupId" ON "CommunityReport" FOR EACH ROW EXECUTE FUNCTION clear_departed_admin_group();
CREATE TRIGGER "ChurchClaim_admin_group_retention" AFTER DELETE OR UPDATE OF "adminGroupId" ON "ChurchClaim" FOR EACH ROW EXECUTE FUNCTION clear_departed_admin_group();
DELETE FROM "AdminCaseGroup" g
  WHERE NOT EXISTS (SELECT 1 FROM "SupportCase" s WHERE s."adminGroupId"=g.id)
    AND NOT EXISTS (SELECT 1 FROM "CommunityReport" r WHERE r."adminGroupId"=g.id)
    AND NOT EXISTS (SELECT 1 FROM "ChurchClaim" c WHERE c."adminGroupId"=g.id);
