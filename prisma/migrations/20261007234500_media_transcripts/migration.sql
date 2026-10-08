-- Manually supplied text inherits the existing item owner, audience and rights.
ALTER TABLE "MediaCatalogItem"
  ADD COLUMN "transcriptText" TEXT NOT NULL DEFAULT '',
  ADD COLUMN chapters JSONB NOT NULL DEFAULT '[]';

-- JavaScript limits count UTF-16 units. Supplementary Unicode code points each
-- count twice, even though PostgreSQL length() counts each one once.
CREATE FUNCTION public.media_transcript_utf16_length(value text)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT length(value) +
    length(regexp_replace(value COLLATE "C", U&'[^\+010000-\+10FFFF]', '', 'g'));
$$;

CREATE FUNCTION public.media_transcript_valid(body text, markers jsonb, duration integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  marker jsonb;
  seconds numeric;
  previous numeric := -1;
  title text;
BEGIN
  IF body IS NULL OR public.media_transcript_utf16_length(body)>60000
    OR body ~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    OR jsonb_typeof(markers) IS DISTINCT FROM 'array'
  THEN RETURN false; END IF;
  IF jsonb_array_length(markers)>100 THEN RETURN false; END IF;
  FOR marker IN SELECT value FROM jsonb_array_elements(markers) LOOP
    IF jsonb_typeof(marker) IS DISTINCT FROM 'object' THEN RETURN false; END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(marker))<>2
      OR NOT (marker ?& ARRAY['startSeconds','title'])
      OR jsonb_typeof(marker->'startSeconds') IS DISTINCT FROM 'number'
      OR jsonb_typeof(marker->'title') IS DISTINCT FROM 'string'
    THEN RETURN false; END IF;
    seconds := (marker->>'startSeconds')::numeric;
    title := marker->>'title';
    IF seconds<>trunc(seconds) OR seconds<0 OR seconds>604800
      OR seconds<=previous OR (duration IS NOT NULL AND seconds>=duration)
      OR public.media_transcript_utf16_length(title)>120
      OR btrim(title, E' \t\n\r' || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')=''
      OR title ~ E'[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    THEN RETURN false; END IF;
    previous := seconds;
  END LOOP;
  RETURN true;
END;
$$;

ALTER TABLE "MediaCatalogItem" ADD CONSTRAINT "MediaCatalogItem_transcript_shape"
  CHECK (public.media_transcript_valid("transcriptText", chapters, "durationSeconds"));

CREATE FUNCTION public.media_transcript_writer_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  protected boolean;
  common text[] := ARRAY['version','controlVersion','updatedAt'];
  scrub_fields text[] := ARRAY[
    'version','controlVersion','updatedAt','transcriptText','chapters',
    'title','description','sourceUrl','sourceProvider','sourceState','acknowledgment',
    'attribution','speakers','churchCredit','series','sequence','topics','scriptureRanges',
    'languageIds','details','recordedOn','durationSeconds','state','removedAt',
    'recoveryRequired','ownerId','createdById'
  ];
BEGIN
  protected := NEW."transcriptText"<>'' OR NEW.chapters<>'[]'::jsonb;
  IF TG_OP='UPDATE' THEN
    protected := protected OR OLD."transcriptText"<>'' OR OLD.chapters<>'[]'::jsonb;
  END IF;
  -- A pre-feature cleanup writer cannot name these fields. Scrub them here
  -- whenever its valid removal/recovery write succeeds; current writers receive
  -- the same safeguard. This never changes audience or creates publication.
  IF NEW.state='REMOVED' OR NEW."removedAt" IS NOT NULL OR NEW."recoveryRequired" THEN
    NEW."transcriptText" := '';
    NEW.chapters := '[]'::jsonb;
  END IF;
  IF NOT protected OR current_setting('gc.media_transcript_writer',true)='v1' THEN
    RETURN NEW;
  END IF;
  IF TG_OP<>'UPDATE' THEN
    RAISE EXCEPTION 'Current media transcript writer required';
  END IF;
  IF NEW.version<OLD.version OR NEW."controlVersion"<OLD."controlVersion" THEN
    RAISE EXCEPTION 'Current media transcript writer required';
  END IF;

  -- No authoring change, including a hash replacement, is allowed through the
  -- compatibility path. Unchanged historical assertions cannot expand scope.
  IF (to_jsonb(NEW)-common) IS NOT DISTINCT FROM (to_jsonb(OLD)-common) THEN RETURN NEW; END IF;
  -- Church work survives erasure of the adult who originally created it.
  IF NEW."createdById" IS NULL
    AND (to_jsonb(NEW)-(common||ARRAY['createdById'])) IS NOT DISTINCT FROM
        (to_jsonb(OLD)-(common||ARRAY['createdById']))
  THEN RETURN NEW; END IF;
  -- Existing unpublish and source/rights-withdrawal commands remain restrictive.
  IF NEW.state='UNPUBLISHED' AND OLD.state IN ('DRAFT','PUBLISHED','UNPUBLISHED') THEN
    IF (to_jsonb(NEW)-(common||ARRAY['state'])) IS NOT DISTINCT FROM
       (to_jsonb(OLD)-(common||ARRAY['state'])) THEN RETURN NEW; END IF;
    IF NEW."sourceState" IN ('REVIEW_NEEDED','UNAVAILABLE')
      AND NEW."sourceUrl" IS NULL AND NEW."sourceProvider" IS NULL
      AND NEW.acknowledgment IS NULL
      AND (to_jsonb(NEW)-(common||ARRAY['state','sourceState','sourceUrl','sourceProvider','acknowledgment']))
        IS NOT DISTINCT FROM
        (to_jsonb(OLD)-(common||ARRAY['state','sourceState','sourceUrl','sourceProvider','acknowledgment']))
    THEN RETURN NEW; END IF;
  END IF;
  IF ((OLD."moderationState"='VISIBLE' AND NEW."moderationState" IN ('HIDDEN','REMOVED'))
      OR (OLD."moderationState"='HIDDEN' AND NEW."moderationState"='REMOVED'))
    AND (to_jsonb(NEW)-(common||ARRAY['moderationState'])) IS NOT DISTINCT FROM
        (to_jsonb(OLD)-(common||ARRAY['moderationState']))
  THEN RETURN NEW; END IF;

  -- Match the existing complete mediaEmpty shape for removal/erasure/recovery.
  -- Merely setting an unavailable state never authorizes replacement metadata.
  IF ((NEW.state='REMOVED' AND NEW."removedAt" IS NOT NULL)
      OR (NEW.state='UNPUBLISHED' AND NEW."recoveryRequired"))
    AND (NOT OLD."recoveryRequired" OR NEW."recoveryRequired")
    AND (OLD."removedAt" IS NULL OR NEW."removedAt" IS NOT NULL)
    AND (NEW."ownerId" IS NULL OR NEW."ownerId" IS NOT DISTINCT FROM OLD."ownerId")
    AND (NEW."createdById" IS NULL OR NEW."createdById" IS NOT DISTINCT FROM OLD."createdById")
    AND NEW.title='' AND NEW.description='' AND NEW."sourceUrl" IS NULL
    AND NEW."sourceProvider" IS NULL AND NEW."sourceState"='REVIEW_NEEDED'
    AND NEW.acknowledgment IS NULL AND NEW.attribution='' AND NEW.speakers=ARRAY[]::text[]
    AND NEW."churchCredit"='' AND NEW.series='' AND NEW.sequence IS NULL
    AND NEW.topics=ARRAY[]::text[] AND NEW."scriptureRanges"='[]'::jsonb
    AND NEW."languageIds"=ARRAY[]::text[] AND NEW.details='null'::jsonb
    AND NEW."recordedOn" IS NULL AND NEW."durationSeconds" IS NULL
    AND (to_jsonb(NEW)-scrub_fields) IS NOT DISTINCT FROM (to_jsonb(OLD)-scrub_fields)
  THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'Current media transcript writer required';
END;
$$;

CREATE TRIGGER "MediaCatalogItem_transcript_writer"
BEFORE INSERT OR UPDATE ON "MediaCatalogItem"
FOR EACH ROW EXECUTE FUNCTION public.media_transcript_writer_guard();
