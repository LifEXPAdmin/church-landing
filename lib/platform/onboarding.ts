import type { PrismaClient } from "@prisma/client";
import { withPostRead } from "./post-access";
import { socialCommand, socialInput } from "./social-operations";
import { expected, PortalError, eligibleWhere } from "./portal-policy";
import { onboardingSteps } from "./onboarding-options";
import { socialUserWhere, socialDiscoveryWhere } from "./social-policy";
import { postReadableWhere } from "./post-access";
import {
  churchWelcomePosts,
  churchWeekEvents,
  currentChurchWelcome,
  welcomePostSelect,
  welcomePostLink
} from "./church-welcome-policy";
import { postId } from "./post-input";
import { optionalOnboardingOutcome } from "./platform-measurement";

export function saveOnboarding(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, [
    "operation",
    "step",
    "dismissed",
    "expectedVersion",
    "mutationId"
    ,"completion"
  ]);
  if (
    input.operation !== "onboarding" ||
    (input.step !== "all" && !onboardingSteps.includes(input.step as never)) ||
    typeof input.dismissed !== "boolean" ||
    (input.completion!==undefined&&(input.completion!==true||input.step!=="all"||input.dismissed!==true))
  )
    throw new PortalError(400, "Choose a supported getting-started step.");
  return socialCommand(
    db,
    token,
    "onboarding",
    input,
    async (tx, ownerId) => {
      const old = await tx.socialPreferences.findUnique({
        where: { ownerId },
        select: { onboardingDismissed: true, onboardingVersion: true }
      });
      expected(input.expectedVersion, old?.onboardingVersion ?? 0);
      const dismissed = new Set(old?.onboardingDismissed ?? []);
      for (const step of input.step === "all"
        ? onboardingSteps
        : [String(input.step)])
        if (input.dismissed) dismissed.add(step);
        else dismissed.delete(step);
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: {
          ownerId,
          onboardingDismissed: [...dismissed],
          onboardingVersion: 1
        },
        update: {
          onboardingDismissed: [...dismissed],
          onboardingVersion: { increment: 1 }
        }
      });
      if(input.step==="all"&&input.dismissed===true)
        await optionalOnboardingOutcome(tx,ownerId,input.completion===true?"COMPLETED":"SKIPPED");
      return {
        id: ownerId,
        version: row.onboardingVersion,
        message: input.completion===true?"Getting started finished. Optional hints remain available in Help.":input.dismissed
          ? "Saved for later. Getting started stays available in Help."
          : "Getting-started hints restored."
      };
    },
    undefined,
    "shared"
  );
}

export function readOnboarding(
  db: PrismaClient,
  token: unknown,
  selected?: unknown,
  now = new Date()
) {
  return withPostRead(db, token, async (tx, context) => {
    if (!context.actorId)
      throw new PortalError(401, "Sign in to resume getting started.");
    const ownerId = context.actorId;
    const profile = await tx.platformUser.findUniqueOrThrow({
      where: { id: ownerId },
      select: {
        emailVerifiedAt: true,
        bio: true,
        presentation: { select: { introduction: true } }
      }
    });
    const preferences = await tx.socialPreferences.findUnique({
      where: { ownerId },
      select: {
        onboardingDismissed: true,
        onboardingVersion: true,
        discoveryVersion: true
      }
    });
    const connections = await tx.churchConnection.findMany({
      where: { userId: ownerId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 201,
      select: {
        state: true,
        preference: { select: { connectionId: true } },
        church: { select: { id: true, name: true, welcomePostId: true } }
      }
    });
    if (connections.length > 200)
      throw new PortalError(503, "Your church connections need a size review.");
    const churches = connections
      .filter((c) => context.churches.includes(c.church.id))
      .map((c) => c.church);
    const church = selected
      ? churches.find((c) => c.id === postId(selected))
      : churches[0];
    if (selected && !church)
      throw new PortalError(
        403,
        "Choose a current approved church connection."
      );
    const contribution = !!(await tx.platformPost.findFirst({
      where: {
        AND: [
          postReadableWhere(context),
          { authorId: ownerId, authorChurchId: null, repostKind: null }
        ]
      },
      select: { id: true }
    }));
    const claims = await tx.churchClaim.findMany({
      where: {
        ownerId,
        status: {
          in: [
            "DRAFT",
            "SUBMITTED",
            "NEEDS_INFORMATION",
            "APPROVED",
            "REJECTED"
          ]
        }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 3,
      select: { id: true, status: true, activatedAt: true }
    });
    const listings = await tx.churchListingSubmission.findMany({
      where: { ownerId, status: { in: ["DRAFT", "NEEDS_INFORMATION"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take: 3,
      select: { id: true, status: true }
    });
    const steps = [
      {
        id: "church",
        label: "Find or request your church",
        href: "/platform/my-church",
        done: churches.length > 0,
        optional: true
      },
      {
        id: "profile",
        label: "Introduce yourself on your profile",
        href: "/platform/profile/me",
        done: !!(
          profile.bio?.trim() || profile.presentation?.introduction.trim()
        ),
        optional: true
      },
      {
        id: "sharing",
        label: "Choose what contact information to share",
        href: "/platform/my-church/sharing",
        done: connections.some((c) => c.state === "APPROVED" && c.preference),
        optional: true
      },
      {
        id: "discovery",
        label: "Choose optional topics, language and discovery",
        href: "/platform/settings/feed/discovery",
        done: (preferences?.discoveryVersion ?? 0) > 0,
        optional: true
      },
      {
        id: "contribute",
        label: "Share a first post or introduction",
        href: church
          ? "/platform/churches/" + church.id + "#church-posts"
          : "/platform#compose-post",
        done: contribution,
        optional: true
      }
    ].map((s) => ({
      ...s,
      dismissed: (preferences?.onboardingDismissed ?? []).includes(s.id)
    }));
    const until = new Date(now.getTime() + 7 * 86400000);
    let week = null;
    if (church) {
      const scope = churchWelcomePosts(context, church.id),
        eventScope = churchWeekEvents(church.id, now, until);
      const events = await tx.calendarOccurrence.findMany({
        where: eventScope,
        orderBy: [{ startAt: "asc" }, { id: "asc" }],
        take: 3,
        select: {
          id: true,
          title: true,
          startAt: true,
          startLocal: true,
          allDay: true,
          timeZone: true,
          responses: { where: { userId: ownerId }, select: { state: true } }
        }
      });
      const notices = await tx.platformPost.findMany({
        where: {
          AND: [
            scope,
            socialDiscoveryWhere(context),
            {
              authorChurchId: church.id,
              id: { not: church.welcomePostId ?? "" },
              publishedAt: { gte: new Date(now.getTime() - 7 * 86400000) }
            }
          ]
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: 3,
        select: welcomePostSelect
      });
      const roles = await tx.postVolunteerSlot.findMany({
        where: {
          OR: [
            { closedAt: null },
            { signups: { some: { userId: ownerId, state: "ACTIVE" } } }
          ],
          post: { AND: [scope, { eventOccurrence: eventScope }] }
        },
        orderBy: { id: "asc" },
        take: 101,
        select: {
          id: true,
          postId: true,
          role: true,
          capacity: true,
          closedAt: true,
          post: {
            select: {
              eventOccurrence: {
                select: { version: true, event: { select: { version: true } } }
              }
            }
          },
          _count: { select: { signups: { where: { state: "ACTIVE" } } } },
          signups: {
            where: { userId: ownerId, state: "ACTIVE" },
            select: { id: true, eventVersion: true, occurrenceVersion: true }
          }
        }
      });
      week = {
        church: { id: church.id, name: church.name },
        until: until.toISOString(),
        welcome: await currentChurchWelcome(
          tx,
          context,
          church.id,
          church.welcomePostId
        ),
        events: events.map((e) => ({
          id: e.id,
          title: e.title,
          startAt: e.startAt.toISOString(),
          startLocal: e.startLocal,
          allDay: e.allDay,
          timeZone: e.timeZone,
          response: e.responses[0]?.state ?? null,
          href: "/platform/events/" + e.id
        })),
        notices: notices.map(welcomePostLink),
        roles: roles
          .slice(0, 100)
          .filter((r) => r._count.signups < r.capacity || r.signups.length)
          .slice(0, 5)
          .map((r) => ({
            id: r.id,
            role: r.role,
            open: r.closedAt ? 0 : Math.max(0, r.capacity - r._count.signups),
            committed: !!r.signups.length,
            detailsChanged:
              !!r.signups[0] &&
              (r.signups[0].eventVersion !==
                r.post.eventOccurrence?.event.version ||
                r.signups[0].occurrenceVersion !==
                  r.post.eventOccurrence?.version),
            href: "/platform/posts/" + r.postId
          })),
        moreRoles: roles.length > 100
      };
    }
    const suggestions = await tx.platformUser.findMany({
      where: {
        AND: [
          socialUserWhere(context),
          eligibleWhere,
          { id: { notIn: [ownerId, ...(context.mutedIds ?? [])] } },
          {
            posts: {
              some: {
                AND: [
                  postReadableWhere(context),
                  { audience: "PUBLIC", authorChurchId: null, repostKind: null }
                ]
              }
            }
          }
        ]
      },
      orderBy: { id: "asc" },
      take: 3,
      select: { id: true, name: true, username: true }
    });
    const suggestedChurches = !church
      ? await tx.church.findMany({
          where: {
            communityListed: true,
            id: {
              notIn: [...context.churches, ...(context.mutedChurchIds ?? [])]
            }
          },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          take: 3,
          select: { id: true, name: true, city: true, region: true }
        })
      : [];
    return {
      ownerId,
      version: preferences?.onboardingVersion ?? 0,
      verified: !!profile.emailVerifiedAt,
      eligible: !!context.eligible,
      steps,
      churches: churches.map((c) => ({ id: c.id, name: c.name })),
      connection: connections[0]
        ? {
            state: connections[0].state,
            churchName: connections[0].church.name
          }
        : null,
      claims: claims.map((c) => ({
        id: c.id,
        status: c.status,
        activated: !!c.activatedAt
      })),
      listings,
      week,
      suggestions: suggestions.map((p) => ({
        name: p.name,
        href: "/platform/profile/" + encodeURIComponent(p.username),
        reason: "Shares posts you can read"
      })),
      suggestedChurches
    };
  });
}
export type OnboardingView = Awaited<ReturnType<typeof readOnboarding>>;
