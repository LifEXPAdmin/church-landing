import { metricUtc } from "./metric-sql";
import { Prisma } from "@prisma/client";
import { ADULT_POLICY } from "./portal-types";
import { METRIC_POLICY } from "./metric-policy";

/** Private relational inputs only. Callers return aggregates, never these rows. */
export function metricSources(version: number, now: Date, cutoff: Date) {
  return Prisma.sql`
  population AS MATERIALIZED (
    SELECT u.id,u."createdAt",u."metricCreationMethod",u."deactivatedAt",u."suspendedAt",u."emailVerifiedAt",u."adultAcknowledgedAt",u."adultPolicyVersion"
      FROM "PlatformUser" u WHERE u."erasedAt" IS NULL AND NOT u."metricExcluded" AND u."createdAt"<=${metricUtc(now)}
  ), public_accounts AS (SELECT id FROM population WHERE "deactivatedAt" IS NULL AND "suspendedAt" IS NULL), eligible AS MATERIALIZED (
    SELECT u.id FROM population u WHERE u."deactivatedAt" IS NULL AND u."suspendedAt" IS NULL
      AND u."emailVerifiedAt" IS NOT NULL AND u."adultAcknowledgedAt" IS NOT NULL
      AND u."adultPolicyVersion"=${ADULT_POLICY}
  ), calendar_grants AS (
    SELECT g."userId",g."churchId" FROM "ChurchCapabilityGrant" g JOIN eligible u ON u.id=g."userId"
      WHERE g."revokedAt" IS NULL AND g.capability IN ('EDIT_CHURCH_CALENDAR','PUBLISH_CHURCH_EVENTS')
        AND (g."dependencyConnectionId" IS NULL OR EXISTS(SELECT 1 FROM "ChurchConnection" c WHERE c.id=g."dependencyConnectionId"
          AND c."userId"=g."userId" AND c."churchId"=g."churchId" AND c.state='APPROVED'))
    UNION SELECT c."userId",g."churchId" FROM "ChurchRoleGrant" g
      JOIN "ChurchPositionAssignment" a ON a.id=g."assignmentId" JOIN "ChurchPosition" p ON p.id=a."positionId"
      JOIN "ChurchConnection" c ON c.id=a."connectionId" JOIN eligible u ON u.id=c."userId"
      WHERE g."revokedAt" IS NULL AND a."revokedAt" IS NULL AND p."archivedAt" IS NULL AND c.state='APPROVED'
        AND g.capability IN ('EDIT_CHURCH_CALENDAR','PUBLISH_CHURCH_EVENTS')
  ), measured AS MATERIALIZED (
    SELECT u.id,u."createdAt",p.* FROM population u JOIN eligible e ON e.id=u.id
    JOIN "PlatformMeasurementChoice" p ON p."userId"=u.id
    WHERE p."enabledAt" IS NOT NULL AND p.policy=${METRIC_POLICY} AND p."enabledAt"<=${metricUtc(now)}
      AND NOT EXISTS(SELECT 1 FROM "PlatformOperatorGrant" g WHERE g."userId"=u.id AND g."revokedAt" IS NULL)
      AND NOT EXISTS(SELECT 1 FROM "SupportCapabilityGrant" g WHERE g."userId"=u.id AND g."revokedAt" IS NULL)
  ), activity AS MATERIALIZED (
    SELECT d."userId",d.version,d.day,CASE WHEN d."firstAt"<${metricUtc(cutoff)} THEN d."lastAt" ELSE d."firstAt" END AS "firstAt",d."lastAt",d.device,d.browser
      FROM "PlatformMetricActivityDay" d JOIN measured m ON m.id=d."userId"
    WHERE d.version=${version} AND d."lastAt">=${metricUtc(cutoff)} AND d."firstAt">=m."enabledAt" AND d."firstAt"<=${metricUtc(now)}
  ), ordinary_posts AS MATERIALIZED (
    SELECT p.id,p."authorId",p."authorChurchId",p."audienceChurchId",p.audience,p."topicCommunityId",p."eventOccurrenceId",p."publishedAt"
      FROM "PlatformPost" p LEFT JOIN public_accounts e ON e.id=p."authorId"
    WHERE p.status='PUBLISHED' AND p."withdrawnAt" IS NULL AND p."moderationState"='VISIBLE'
      AND (p."authorChurchId" IS NOT NULL OR e.id IS NOT NULL)
      AND p."publishedAt"<=${metricUtc(now)} AND p.type<>'PRAYER' AND p."repostKind" IS NULL
      AND (p."topicCommunityId" IS NULL OR EXISTS(SELECT 1 FROM "TopicCommunity" t
        JOIN "TopicMembership" m ON m."communityId"=t.id AND m."userId"=p."authorId"
        WHERE t.id=p."topicCommunityId" AND t.lifecycle='ACTIVE' AND t."moderationState"='VISIBLE'
          AND NOT t."recoveryRequired" AND m."restrictedAt" IS NULL AND EXISTS(SELECT 1 FROM public_accounts owner WHERE owner.id=t."ownerId")))
      AND (p.audience='PUBLIC' OR (p.audience='CHURCH' AND (p."authorChurchId"=p."audienceChurchId" OR EXISTS(SELECT 1 FROM "ChurchConnection" c
        WHERE c."userId"=p."authorId" AND c."churchId"=p."audienceChurchId" AND c.state='APPROVED'))))
      AND (p."eventOccurrenceId" IS NULL OR EXISTS(SELECT 1 FROM "CalendarOccurrence" o
        JOIN "CalendarEvent" e ON e.id=o."eventId" JOIN "PlatformCalendar" c ON c.id=e."calendarId"
        WHERE o.id=p."eventOccurrenceId" AND o."canceledAt" IS NULL AND e."canceledAt" IS NULL AND c."archivedAt" IS NULL))
  ), visible_comments AS (
    SELECT c.id,c."authorId",c."authorChurchId",c."postId",c."parentId",c."createdAt"
      FROM "PlatformPostComment" c JOIN ordinary_posts p ON p.id=c."postId"
      LEFT JOIN public_accounts e ON e.id=c."authorId"
    WHERE c."deletedAt" IS NULL AND c."moderationState"='VISIBLE'
      AND (c."authorChurchId" IS NOT NULL OR e.id IS NOT NULL)
      AND (c."topicCommunityId" IS NULL OR EXISTS(SELECT 1 FROM "TopicMembership" t
        WHERE t."communityId"=c."topicCommunityId" AND t."userId"=c."authorId" AND t."restrictedAt" IS NULL))
      AND (p.audience='PUBLIC' OR EXISTS(SELECT 1 FROM "ChurchConnection" x
        WHERE x."userId"=c."authorId" AND x."churchId"=p."audienceChurchId" AND x.state='APPROVED'))
  ), comments AS (
    SELECT c.* FROM visible_comments c WHERE c."parentId" IS NULL
    UNION ALL SELECT c.* FROM visible_comments c JOIN comments parent ON parent.id=c."parentId" AND parent."postId"=c."postId"
  ), event_access AS (
    SELECT r.id,r."userId",r."goingSince",c."churchId" FROM "CalendarResponse" r
      JOIN "CalendarOccurrence" o ON o.id=r."occurrenceId" JOIN "CalendarEvent" e ON e.id=o."eventId"
      JOIN "PlatformCalendar" c ON c.id=e."calendarId"
    WHERE r.state='GOING' AND o."canceledAt" IS NULL AND e."canceledAt" IS NULL AND c."archivedAt" IS NULL
      AND (c."ownerId" IS NULL OR EXISTS(SELECT 1 FROM eligible u WHERE u.id=c."ownerId"))
      AND (c."ownerId"=r."userId" OR EXISTS(SELECT 1 FROM calendar_grants g WHERE g."userId"=r."userId" AND g."churchId"=c."churchId") OR (c."churchId" IS NOT NULL AND
        (e.visibility='PUBLIC' OR (e.visibility='CHURCH' AND EXISTS(SELECT 1 FROM "ChurchConnection" x
          WHERE x."userId"=r."userId" AND x."churchId"=c."churchId" AND x.state='APPROVED'))))
        OR EXISTS(SELECT 1 FROM "CalendarShare" s JOIN "ChurchConnection" owner ON owner.id=s."connectionId"
          JOIN "ChurchConnection" viewer ON viewer."churchId"=s."churchId" AND viewer."userId"=r."userId" AND viewer.state='APPROVED'
          WHERE s."calendarId"=c.id AND s."revokedAt" IS NULL AND s.level='DETAILS'
            AND owner."userId"=c."ownerId" AND owner."churchId"=s."churchId" AND owner.state='APPROVED')
        OR EXISTS(SELECT 1 FROM "CalendarEventShare" s JOIN "ChurchConnection" owner ON owner.id=s."connectionId"
          JOIN "ChurchConnection" viewer ON viewer."churchId"=s."churchId" AND viewer."userId"=r."userId" AND viewer.state='APPROVED'
          WHERE s."eventId"=e.id AND s."revokedAt" IS NULL AND s.level='DETAILS'
            AND owner."userId"=c."ownerId" AND owner."churchId"=s."churchId" AND owner.state='APPROVED'))
  ), source_actions AS (
    SELECT f."followerId" AS actor,'FOLLOW'::text AS kind,f."createdAt" AS at,NULL::text AS church
      FROM "PlatformFollow" f JOIN public_accounts e ON e.id=f."followingId"
      WHERE NOT EXISTS(SELECT 1 FROM "SocialRelationship" r WHERE r.blocked AND
        ((r."ownerId"=f."followerId" AND r."targetUserId"=f."followingId") OR (r."ownerId"=f."followingId" AND r."targetUserId"=f."followerId")))
    UNION ALL SELECT r."ownerId",'FOLLOW',r."followingSince",NULL FROM "SocialRelationship" r
      JOIN "Church" c ON c.id=r."churchId" WHERE r."followingChurch" AND c."communityListed"
    UNION ALL SELECT m."userId",'FOLLOW',m."followingSince",NULL FROM "TopicMembership" m
      JOIN "TopicCommunity" t ON t.id=m."communityId" WHERE m.following AND m."restrictedAt" IS NULL
        AND t.lifecycle='ACTIVE' AND t."moderationState"='VISIBLE' AND NOT t."recoveryRequired" AND EXISTS(SELECT 1 FROM public_accounts owner WHERE owner.id=t."ownerId")
    UNION ALL SELECT p."authorId",'POST',p."publishedAt",coalesce(p."authorChurchId",p."audienceChurchId") FROM ordinary_posts p
    UNION ALL SELECT c."authorId",'REPLY',c."createdAt",coalesce(c."authorChurchId",p."audienceChurchId")
      FROM comments c JOIN ordinary_posts p ON p.id=c."postId"
    UNION ALL SELECT r."userId",'RSVP',r."goingSince",r."churchId" FROM event_access r
    UNION ALL SELECT s."userId",'VOLUNTEER',s."activeSince",coalesce(p."authorChurchId",p."audienceChurchId")
      FROM "PostVolunteerSignup" s JOIN "PostVolunteerSlot" slot ON slot.id=s."slotId"
      JOIN ordinary_posts p ON p.id=slot."postId" WHERE s.state='ACTIVE'
        AND (p.audience='PUBLIC' OR EXISTS(SELECT 1 FROM "ChurchConnection" c WHERE c."userId"=s."userId"
          AND c."churchId"=p."audienceChurchId" AND c.state='APPROVED'))
    UNION ALL SELECT audit."actorId",'EVENT',e."createdAt",c."churchId" FROM "CalendarEvent" e
      JOIN "PlatformCalendar" c ON c.id=e."calendarId"
      JOIN LATERAL (SELECT a."actorId" FROM "CalendarAudit" a WHERE a."calendarId"=c.id AND a."targetId"=e.id
        AND a.action='CREATE_EVENT' ORDER BY a."createdAt",a.id LIMIT 1) audit ON true
      WHERE e."canceledAt" IS NULL AND c."archivedAt" IS NULL
      AND (c."ownerId" IS NULL OR EXISTS(SELECT 1 FROM eligible u WHERE u.id=c."ownerId"))
  ), actions AS MATERIALIZED (
    SELECT s.* FROM source_actions s JOIN measured m ON m.id=s.actor
    WHERE s.at>=greatest(m."createdAt",m."enabledAt",${metricUtc(cutoff)}) AND s.at<=${metricUtc(now)}
  )`;
}
