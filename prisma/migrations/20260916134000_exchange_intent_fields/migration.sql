-- Add distinct requests and skilled-help fields without changing existing items.
ALTER TYPE "ExchangeListingIntent" ADD VALUE 'WANTED';
ALTER TYPE "ExchangeListingIntent" ADD VALUE 'SERVICE';
ALTER TYPE "ExchangeListingIntent" ADD VALUE 'CHURCH_NEED';
ALTER TABLE "ExchangeListing"
  ADD COLUMN "requestedItems" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "neededBy" TEXT,
  ADD COLUMN "serviceArea" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "availability" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "qualifications" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "servicePricing" TEXT,
  ADD COLUMN "serviceUnit" TEXT;

-- Cast intent to text while adding enum values in this migration. New values
-- must not be used as enum literals before their adding transaction commits.
ALTER TABLE "ExchangeListing" DROP CONSTRAINT "ExchangeListing_shape";
ALTER TABLE "ExchangeListing" ADD CONSTRAINT "ExchangeListing_shape" CHECK (
  version > 0 AND "visibilityVersion" > 0 AND "moderationVersion" >= 0
  AND (("ownerId" IS NOT NULL)::integer + ("ownerChurchId" IS NOT NULL)::integer = 1)
  AND length(title) <= 120 AND length(description) <= 5000
  AND length("requestedItems") <= 2000 AND length("serviceArea") <= 500
  AND length(availability) <= 1000 AND length(qualifications) <= 2000
  AND (category IS NULL OR (intent::text='SERVICE' AND category IN ('HOME_GARDEN','TECHNOLOGY_HELP','CREATIVE_SKILLS','LEARNING_HELP','OTHER_SKILL'))
    OR (intent::text<>'SERVICE' AND category IN ('HOUSEHOLD','FURNITURE','CLOTHING','BOOKS','ELECTRONICS','TOOLS','HOBBIES')))
  AND (condition IS NULL OR (intent::text<>'SERVICE' AND condition IN ('NEW','LIKE_NEW','GOOD','FAIR','PARTS')))
  AND (currency IS NULL OR currency IN ('USD','CAD','EUR','GBP','AUD','NZD','JPY','CHF','SEK','NOK','DKK','MXN','BRL','INR','ZAR','KWD'))
  AND ("priceMinor" IS NULL OR (currency IS NOT NULL AND "priceMinor" BETWEEN 1 AND 99999999))
  AND ((intent::text='SALE' OR (intent::text='SERVICE' AND coalesce("servicePricing",'')='FIXED')) OR (currency IS NULL AND "priceMinor" IS NULL))
  AND ("neededBy" IS NULL OR ("neededBy" ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' AND "neededBy"::date::text="neededBy"))
  AND (intent::text IN ('WANTED','CHURCH_NEED') OR ("requestedItems"='' AND "neededBy" IS NULL))
  AND ("servicePricing" IS NULL OR "servicePricing" IN ('FREE','FIXED'))
  AND ("serviceUnit" IS NULL OR (coalesce("servicePricing",'')='FIXED' AND "serviceUnit" IN ('HOUR','TASK')))
  AND (intent::text='SERVICE' OR ("serviceArea"='' AND availability='' AND qualifications='' AND "servicePricing" IS NULL AND "serviceUnit" IS NULL))
  AND (intent::text<>'CHURCH_NEED' OR "ownerChurchId" IS NOT NULL)
  AND (country IS NULL OR country ~ '^[A-Z]{2}$')
  AND ("placeId" IS NULL OR (country IS NOT NULL AND "placeId" BETWEEN 1 AND 100000000 AND "placeLabel" IS NOT NULL))
  AND (audience <> 'PUBLIC' OR "audienceChurchId" IS NULL)
  AND ("ownerChurchId" IS NULL OR "audienceChurchId" IS NULL OR "ownerChurchId"="audienceChurchId")
  AND (state NOT IN ('ACTIVE','RESERVED','CLOSED') OR (
    length(trim(title)) >= 3 AND length(trim(description)) >= 1 AND category IS NOT NULL
    AND (intent::text NOT IN ('FREE','SALE') OR condition IS NOT NULL)
    AND (intent::text NOT IN ('WANTED','CHURCH_NEED') OR length(trim("requestedItems")) >= 1)
    AND (intent::text <> 'SERVICE' OR (length(trim("serviceArea")) >= 1 AND length(trim(availability)) >= 1
      AND length(trim(qualifications)) >= 1 AND "servicePricing" IS NOT NULL
      AND ("servicePricing" <> 'FIXED' OR "serviceUnit" IS NOT NULL)))
    AND "placeId" IS NOT NULL AND "publishedAt" IS NOT NULL AND "confirmedAt" IS NOT NULL AND "itemPolicy" IS NOT NULL
    AND ("itemPolicy"='exchange-listings-v2' OR (intent::text IN ('FREE','SALE') AND "itemPolicy"='ordinary-items-v1'))
    AND ((intent::text<>'SALE' AND NOT(intent::text='SERVICE' AND coalesce("servicePricing",'')='FIXED')) OR (currency IS NOT NULL AND "priceMinor" IS NOT NULL))
    AND (audience <> 'CHURCH' OR "audienceChurchId" IS NOT NULL)
  ))
  AND ("erasedAt" IS NULL OR state='ARCHIVED')
);
