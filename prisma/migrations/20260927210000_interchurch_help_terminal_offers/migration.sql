-- Completed history does not reserve a new explicit offer slot.
UPDATE "InterchurchHelpOffer" o SET "endedAt" = a."completedAt"
FROM "InterchurchHelpAgreement" a
WHERE a."offerId" = o.id AND a.state = 'COMPLETED' AND o."endedAt" IS NULL;
DROP INDEX "InterchurchHelpOffer_active_personal";
DROP INDEX "InterchurchHelpOffer_active_organization";
CREATE UNIQUE INDEX "InterchurchHelpOffer_active_personal" ON "InterchurchHelpOffer" ("requestId", "responderId") WHERE kind='PERSONAL' AND state IN ('OFFERED','SELECTED') AND "authorityKey" IS NOT NULL AND "endedAt" IS NULL;
CREATE UNIQUE INDEX "InterchurchHelpOffer_active_organization" ON "InterchurchHelpOffer" ("requestId", "responderId", "respondingChurchId") WHERE kind='ORGANIZATION' AND state IN ('OFFERED','SELECTED') AND "authorityKey" IS NOT NULL AND "endedAt" IS NULL;
