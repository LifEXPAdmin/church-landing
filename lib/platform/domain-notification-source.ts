import type { Prisma, SocialEvent } from "@prisma/client";
import {
  postContext,
  postReadableWhere,
  type PostContext
} from "./post-access";
import { commentVisibleWhere } from "./comment-policy";
import { eligibleWhere } from "./portal-policy";
import { effectiveChurchGrants } from "./church-permissions";
import { calendarContext, eventAccess, eventInclude } from "./calendar-access";
import type { NotificationSource } from "./notification-source";

type Tx = Prisma.TransactionClient;
export const domainNotificationKinds = [
  "AUTHOR_POST",
  "POST_REACTION",
  "COMMENT_REACTION",
  "PRAYER_ACK",
  "CHURCH_REVIEW",
  "CHURCH_CONNECTION",
  "EVENT_CHANGED",
  "RSVP_CHANGED",
  "VOLUNTEER_CHANGED",
  "VOLUNTEER_CONFIRMATION"
];

// Batch current metadata, then return only an authorized canonical destination.
// In particular, neither prayer identities nor personal calendar titles leave here.
export async function domainNotificationSources(
  tx: Tx,
  events: SocialEvent[],
  delivery: boolean,
  now: Date,
  suppliedContext?: PostContext
): Promise<Map<string, NotificationSource>> {
  const result = new Map<string, NotificationSource>();
  const ownerId = events[0]?.recipientId;
  if (
    !ownerId ||
    events.length > 50 ||
    events.some((e) => e.recipientId !== ownerId)
  )
    return result;
  const add = (
    e: SocialEvent,
    category: NotificationSource["category"],
    href: string,
    group: string
  ) => {
    if (e.notificationCategory === category)
      result.set(e.id, { category, href, group });
  };
  const context = suppliedContext ?? (await postContext(tx, ownerId));
  if (context.actorId !== ownerId || !context.eligible) return result;
  const postEvents = events.filter((e) => e.postId);
  const posts = new Map(
    (postEvents.length
      ? await tx.platformPost.findMany({
          where: {
            AND: [
              { id: { in: postEvents.map((e) => e.postId!) } },
              postReadableWhere(context)
            ]
          },
          select: {
            id: true,
            authorId: true,
            authorChurchId: true,
            audience: true,
            audienceChurchId: true,
            publishedAt: true,
            eventOccurrenceId: true,
            topicCommunityId: true,
            eventOccurrence: {
              select: {
                event: {
                  select: {
                    visibility: true,
                    calendar: { select: { churchId: true } }
                  }
                }
              }
            }
          },
          take: 50
        })
      : []
    ).map((p) => [p.id, p])
  );
  const commentEvents = events.filter((e) => e.commentId);
  const comments = new Map(
    (commentEvents.length
      ? await tx.platformPostComment.findMany({
          where: {
            AND: [
              {
                id: { in: commentEvents.map((e) => e.commentId!) },
                postId: { in: [...posts.keys()] }
              },
              commentVisibleWhere(context)
            ]
          },
          select: {
            id: true,
            postId: true,
            authorId: true,
            authorChurchId: true
          },
          take: 50
        })
      : []
    ).map((c) => [c.id, c])
  );
  const mutedPost = (p: NonNullable<ReturnType<typeof posts.get>>) =>
    p.authorChurchId
      ? context.mutedChurchIds?.includes(p.authorChurchId)
      : context.mutedIds?.includes(p.authorId);
  const authors = events.filter((e) => e.kind === "AUTHOR_POST");
  const bells = authors.length
    ? await tx.socialRelationship.findMany({
        where: {
          ownerId,
          authorBellSince: { not: null },
          blocked: false,
          OR: [
            {
              targetUserId: {
                in: [...posts.values()]
                  .filter((p) => !p.authorChurchId)
                  .map((p) => p.authorId)
              }
            },
            {
              churchId: {
                in: [...posts.values()].flatMap((p) =>
                  p.authorChurchId ? [p.authorChurchId] : []
                )
              }
            }
          ]
        },
        select: {
          targetUserId: true,
          churchId: true,
          authorBellSince: true,
          muted: true,
          snoozedUntil: true
        },
        take: 50
      })
    : [];
  for (const e of authors) {
    const p = posts.get(e.postId!);
    if (
      !p ||
      p.id !== e.sourceId ||
      p.authorId !== e.actorId ||
      p.authorId === ownerId ||
      !p.publishedAt ||
      p.publishedAt.getTime() !== e.createdAt.getTime()
    )
      continue;
    const bell = bells.find((b) =>
      p.authorChurchId
        ? b.churchId === p.authorChurchId
        : b.targetUserId === p.authorId
    );
    if (
      !bell?.authorBellSince ||
      bell.authorBellSince >= e.createdAt ||
      bell.muted ||
      (bell.snoozedUntil && bell.snoozedUntil > now)
    )
      continue;
    add(
      e,
      "posts",
      `/platform/posts/${p.id}`,
      `author:${p.authorChurchId ?? p.authorId}`
    );
  }
  const reactions = events.filter((e) =>
    ["POST_REACTION", "COMMENT_REACTION", "PRAYER_ACK"].includes(e.kind)
  );
  if (reactions.length) {
    const people = new Map(
      (
        await tx.platformUser.findMany({
          where: {
            id: {
              in: reactions.map((e) => e.actorId),
              notIn: context.blockedIds ?? []
            },
            ...eligibleWhere
          },
          select: {
            id: true,
            connections: {
              where: { state: "APPROVED" },
              select: { churchId: true },
              take: 201
            },
            topicMemberships: {
              where: { restrictedAt: { not: null } },
              select: { communityId: true },
              take: 2001
            }
          },
          take: 50
        })
      ).map((u) => [u.id, u])
    );
    const likes = new Map(
      (
        await tx.platformPostLike.findMany({
          where: {
            id: {
              in: reactions
                .filter((e) => e.kind === "POST_REACTION")
                .map((e) => e.sourceId!)
            },
            active: true
          },
          take: 50
        })
      ).map((r) => [r.id, r])
    );
    const commentLikes = new Map(
      (
        await tx.commentLike.findMany({
          where: {
            id: {
              in: reactions
                .filter((e) => e.kind === "COMMENT_REACTION")
                .map((e) => e.sourceId!)
            },
            active: true
          },
          take: 50
        })
      ).map((r) => [r.id, r])
    );
    const prayers = new Map(
      (
        await tx.prayerRecord.findMany({
          where: {
            id: {
              in: reactions
                .filter((e) => e.kind === "PRAYER_ACK")
                .map((e) => e.sourceId!)
            },
            acknowledgedAt: { not: null }
          },
          take: 50
        })
      ).map((r) => [r.id, r])
    );
    for (const e of reactions) {
      const p = posts.get(e.postId!),
        c = e.commentId ? comments.get(e.commentId) : null,
        actor = people.get(e.actorId);
      if (
        !p ||
        !actor ||
        actor.id === ownerId ||
        (e.commentId && (!c || c.postId !== p.id)) ||
        (c
          ? c.authorChurchId || c.authorId !== ownerId
          : p.authorChurchId || p.authorId !== ownerId) ||
        (p.audience === "CHURCH" &&
          !actor.connections.some((r) => r.churchId === p.audienceChurchId)) ||
        (p.eventOccurrence?.event.visibility === "CHURCH" &&
          !actor.connections.some(
            (r) => r.churchId === p.eventOccurrence?.event.calendar.churchId
          )) ||
        (p.topicCommunityId &&
          actor.topicMemberships.some(
            (r) => r.communityId === p.topicCommunityId
          )) ||
        (delivery && (mutedPost(p) || context.mutedIds?.includes(actor.id)))
      )
        continue;
      const row =
        e.kind === "POST_REACTION"
          ? likes.get(e.sourceId!)
          : e.kind === "COMMENT_REACTION"
            ? commentLikes.get(e.sourceId!)
            : prayers.get(e.sourceId!);
      if (!row || row.version < (e.sourceVersion ?? Infinity)) continue;
      if ("userId" in row ? row.userId !== actor.id : row.ownerId !== actor.id)
        continue;
      if (
        e.kind === "POST_REACTION" &&
        (!("postId" in row) || row.postId !== p.id)
      )
        continue;
      if (
        e.kind === "COMMENT_REACTION" &&
        (!("commentId" in row) || row.commentId !== e.commentId)
      )
        continue;
      if (
        e.kind === "PRAYER_ACK" &&
        (!("postId" in row) ||
          row.postId !== p.id ||
          !("commentId" in row) ||
          row.commentId !== e.commentId)
      )
        continue;
      add(
        e,
        e.kind === "PRAYER_ACK" ? "prayer" : "reactions",
        `/platform/posts/${p.id}${c ? `?comment=${c.id}` : ""}`,
        `reaction:${e.commentId ?? p.id}`
      );
    }
  }
  const churches = events.filter((e) =>
    ["CHURCH_REVIEW", "CHURCH_CONNECTION"].includes(e.kind)
  );
  if (churches.length) {
    const connections = new Map(
      (
        await tx.churchConnection.findMany({
          where: {
            id: { in: churches.map((e) => e.sourceId!) },
            user: eligibleWhere
          },
          select: {
            id: true,
            userId: true,
            churchId: true,
            state: true,
            version: true
          },
          take: 50
        })
      ).map((c) => [c.id, c])
    );
    const grants = await effectiveChurchGrants(
      tx,
      ownerId,
      [...new Set([...connections.values()].map((c) => c.churchId))],
      ["REVIEW_CONNECTIONS"]
    );
    for (const e of churches) {
      const c = connections.get(e.sourceId!);
      if (!c || c.version < (e.sourceVersion ?? Infinity)) continue;
      if (e.kind === "CHURCH_CONNECTION" && c.userId === ownerId)
        add(e, "church", "/platform/my-church", `connection:${c.id}`);
      if (
        e.kind === "CHURCH_REVIEW" &&
        c.userId === e.actorId &&
        c.userId !== ownerId &&
        c.state === "PENDING" &&
        c.version === e.sourceVersion &&
        grants.some(
          (g) => g.churchId === c.churchId && g.createdAt <= e.createdAt
        )
      )
        add(
          e,
          "church",
          `/platform/churches/${c.churchId}/review`,
          `connection:${c.id}`
        );
    }
  }
  const commitments = events.filter((e) =>
    [
      "EVENT_CHANGED",
      "RSVP_CHANGED",
      "VOLUNTEER_CHANGED",
      "VOLUNTEER_CONFIRMATION"
    ].includes(e.kind)
  );
  if (commitments.length) {
    const actor = await tx.platformUser.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        name: true,
        username: true,
        suspendedAt: true,
        deactivatedAt: true,
        emailVerifiedAt: true,
        adultAcknowledgedAt: true,
        adultPolicyVersion: true,
        portalVersion: true
      }
    });
    const calendar = await calendarContext(tx, actor);
    const responses = await tx.calendarResponse.findMany({
      where: {
        userId: ownerId,
        OR: [
          {
            id: {
              in: commitments
                .filter((e) => e.kind === "RSVP_CHANGED")
                .map((e) => e.sourceId!)
            }
          },
          {
            occurrenceId: {
              in: commitments
                .filter((e) => e.kind === "EVENT_CHANGED")
                .map((e) => e.sourceId!)
            }
          }
        ]
      },
      take: 100
    });
    const signups = await tx.postVolunteerSignup.findMany({
      where: {
        userId: ownerId,
        OR: [
          {
            id: {
              in: commitments
                .filter((e) => e.kind === "VOLUNTEER_CONFIRMATION")
                .map((e) => e.sourceId!)
            }
          },
          {
            slotId: {
              in: commitments
                .filter((e) => e.kind === "VOLUNTEER_CHANGED")
                .map((e) => e.sourceId!)
            }
          },
          {
            slot: {
              post: {
                eventOccurrenceId: {
                  in: commitments
                    .filter((e) => e.kind === "EVENT_CHANGED")
                    .map((e) => e.sourceId!)
                }
              }
            }
          }
        ]
      },
      include: {
        slot: {
          select: {
            id: true,
            postId: true,
            version: true,
            post: { select: { eventOccurrenceId: true } }
          }
        }
      },
      take: 601
    });
    if (signups.length > 600) return result;
    const occurrenceIds = [
      ...new Set([
        ...commitments
          .filter((e) => e.kind === "EVENT_CHANGED")
          .map((e) => e.sourceId!),
        ...responses.map((r) => r.occurrenceId),
        ...signups.flatMap((r) =>
          r.slot.post.eventOccurrenceId ? [r.slot.post.eventOccurrenceId] : []
        )
      ])
    ];
    const occurrences = new Map(
      (
        await tx.calendarOccurrence.findMany({
          where: { id: { in: occurrenceIds } },
          include: { event: { include: eventInclude } },
          take: 150
        })
      ).map((o) => [o.id, o])
    );
    const details = (id: string | null | undefined) => {
      const o = id ? occurrences.get(id) : null;
      return o &&
        ["EDIT", "DETAILS"].includes(eventAccess(calendar, o.event) ?? "")
        ? o
        : null;
    };
    for (const e of commitments) {
      if (e.kind === "EVENT_CHANGED") {
        const o = details(e.sourceId);
        const participating =
          responses.some(
            (r) =>
              r.occurrenceId === e.sourceId &&
              r.state !== "DECLINED" &&
              r.updatedAt <= e.createdAt
          ) ||
          signups.some(
            (r) =>
              r.slot.post.eventOccurrenceId === e.sourceId &&
              r.state === "ACTIVE" &&
              r.updatedAt <= e.createdAt
          );
        if (o && o.version >= (e.sourceVersion ?? Infinity) && participating)
          add(e, "commitments", `/platform/events/${o.id}`, `event:${o.id}`);
      } else if (e.kind === "RSVP_CHANGED") {
        const r = responses.find((r) => r.id === e.sourceId),
          o = r && details(r.occurrenceId);
        if (r && o && r.version >= (e.sourceVersion ?? Infinity))
          add(e, "commitments", `/platform/events/${o.id}`, `event:${o.id}`);
      } else {
        const r = signups.find((r) =>
          e.kind === "VOLUNTEER_CONFIRMATION"
            ? r.id === e.sourceId
            : r.slotId === e.sourceId &&
              r.state === "ACTIVE" &&
              r.updatedAt <= e.createdAt
        );
        if (!r) continue;
        if (
          e.kind === "VOLUNTEER_CONFIRMATION" &&
          r.version >= (e.sourceVersion ?? Infinity)
        ) {
          // An owned confirmation remains available without revealing lost details.
          add(e, "commitments", "/platform/commitments", `signup:${r.id}`);
        } else if (
          details(r.slot.post.eventOccurrenceId) &&
          posts.has(r.slot.postId) &&
          r.slot.version >= (e.sourceVersion ?? Infinity)
        )
          add(
            e,
            "commitments",
            `/platform/posts/${r.slot.postId}`,
            `slot:${r.slot.id}`
          );
      }
    }
  }
  return result;
}
