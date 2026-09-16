import { photoTagNotificationSources } from "./photo-tag-notification-source";
import { feedbackNotificationSources } from "./feedback-notification-source";
import type { FeedbackChannel } from "./feedback-followup-policy";
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
  "FEEDBACK_CASE",
  "FEEDBACK_IDEA",
  "AUTHOR_POST",
  "POST_MENTION",
  "FRIEND_CONNECTED",
  "PHOTO_TAG_REQUEST",
  "PHOTO_TAG_APPROVED",
  "POST_REACTION",
  "COMMENT_REACTION",
  "PRAYER_ACK",
  "CHURCH_REVIEW",
  "CHURCH_CONNECTION",
  "CHURCH_ROLE",
  "CHURCH_CAPABILITY",
  "EVENT_CHANGED",
  "RSVP_CHANGED",
  "VOLUNTEER_CHANGED",
  "VOLUNTEER_REQUEST",
  "VOLUNTEER_CONFIRMATION"
];

// Batch current metadata, then return only an authorized canonical destination.
// In particular, neither prayer identities nor personal calendar titles leave here.
export async function domainNotificationSources(
  tx: Tx,
  events: SocialEvent[],
  delivery: boolean,
  now: Date,
  suppliedContext?: PostContext,
  feedbackChannel: FeedbackChannel = delivery ? "PUSH" : "IN_APP"
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
    group: string,
    summary?: string
  ) => {
    if (e.notificationCategory === category)
      result.set(e.id, {
        category,
        href,
        group,
        ...(summary ? { summary } : {})
      });
  };
  const context = suppliedContext ?? (await postContext(tx, ownerId));
  if (context.actorId !== ownerId || !context.eligible) return result;
  const friends = events.filter((e) => e.kind === "FRIEND_CONNECTED");
  if (friends.length) {
    const rows = await tx.friendAcceptance.findMany({
      where: {
        id: { in: friends.map((e) => e.sourceId!) },
        inviterId: ownerId,
        state: "CONNECTED",
        inviter: eligibleWhere,
        recipient: eligibleWhere
      },
      select: {
        id: true,
        recipientId: true,
        recipient: { select: { username: true } }
      },
      take: 50
    });
    const ids = rows.map((r) => r.recipientId);
    const follows = await tx.platformFollow.findMany({
      where: {
        OR: [
          { followerId: ownerId, followingId: { in: ids } },
          { followingId: ownerId, followerId: { in: ids } }
        ]
      },
      select: { followerId: true, followingId: true },
      take: 100
    });
    for (const e of friends) {
      const row = rows.find((r) => r.id === e.sourceId);
      if (
        row &&
        row.recipientId === e.actorId &&
        e.actorId !== ownerId &&
        e.sourceVersion === 1 &&
        !context.blockedIds?.includes(e.actorId) &&
        !context.mutedIds?.includes(e.actorId) &&
        follows.some(
          (f) => f.followerId === ownerId && f.followingId === e.actorId
        ) &&
        follows.some(
          (f) => f.followingId === ownerId && f.followerId === e.actorId
        )
      )
        add(
          e,
          "requests",
          `/platform/profile/${row.recipient.username}`,
          `friend:${row.id}`
        );
    }
  }
  const photoTags = await photoTagNotificationSources(
    tx,
    events.filter(
      (e) => e.kind === "PHOTO_TAG_REQUEST" || e.kind === "PHOTO_TAG_APPROVED"
    ),
    context
  );
  for (const [id, source] of photoTags) result.set(id, source);
  const feedback = await feedbackNotificationSources(
    tx,
    events.filter(
      (e) => e.kind === "FEEDBACK_CASE" || e.kind === "FEEDBACK_IDEA"
    ),
    feedbackChannel
  );
  for (const [id, source] of feedback) result.set(id, source);
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
  const mentionEvents = events.filter((e) => e.kind === "POST_MENTION");
  if (mentionEvents.length) {
    const mentions = await tx.postMention.findMany({
      where: {
        id: { in: mentionEvents.map((e) => e.sourceId!) },
        recipientId: ownerId,
        active: true
      },
      take: 50
    });
    const preference = await tx.socialPreferences.findUnique({
      where: { ownerId },
      select: { mentions: true }
    });
    const follows =
      preference?.mentions === "FOLLOWED"
        ? await tx.platformFollow.findMany({
            where: {
              followerId: ownerId,
              followingId: { in: mentionEvents.map((e) => e.actorId) }
            },
            select: { followingId: true },
            take: 50
          })
        : [];
    for (const e of mentionEvents) {
      const p = e.postId ? posts.get(e.postId) : null;
      if (
        p &&
        p.authorId === e.actorId &&
        e.actorId !== ownerId &&
        !context.blockedIds?.includes(e.actorId) &&
        !mutedPost(p) &&
        mentions.some((m) => m.id === e.sourceId && m.postId === p.id) &&
        (!preference ||
          preference.mentions === "EVERYONE" ||
          (preference.mentions === "FOLLOWED" &&
            follows.some((f) => f.followingId === e.actorId)))
      )
        add(e, "mentions", `/platform/posts/${p.id}`, `post-mention:${p.id}`);
    }
  }
  const authors = events.filter((e) =>
    ["AUTHOR_POST", "VOLUNTEER_REQUEST"].includes(e.kind)
  );
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
            church: { select: { name: true } },
            state: true,
            version: true
          },
          take: 50
        })
      ).map((c) => [c.id, c])
    );
    const grants = churches.some((e) => e.kind === "CHURCH_REVIEW")
      ? await effectiveChurchGrants(
          tx,
          ownerId,
          [...new Set([...connections.values()].map((c) => c.churchId))],
          ["REVIEW_CONNECTIONS"]
        )
      : [];
    for (const e of churches) {
      const c = connections.get(e.sourceId!);
      if (!c || c.version < (e.sourceVersion ?? Infinity)) continue;
      if (e.kind === "CHURCH_CONNECTION" && c.userId === ownerId)
        add(
          e,
          "church",
          "/platform/my-church",
          `connection:${c.id}`,
          `Your connection with ${c.church.name} changed`
        );
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
          `connection:${c.id}`,
          `A connection request for ${c.church.name} needs review`
        );
    }
  }
  const access = events.filter((e) =>
    ["CHURCH_ROLE", "CHURCH_CAPABILITY"].includes(e.kind)
  );
  if (access.length) {
    const directIds = access
        .filter((e) => e.kind === "CHURCH_CAPABILITY")
        .map((e) => e.sourceId!),
      roleIds = access
        .filter((e) => e.kind === "CHURCH_ROLE")
        .map((e) => e.sourceId!);
    const direct = new Map(
      (directIds.length
        ? await tx.churchCapabilityGrant.findMany({
            where: { id: { in: directIds }, userId: ownerId },
            select: {
              id: true,
              version: true,
              churchId: true,
              church: { select: { name: true } }
            },
            take: 50
          })
        : []
      ).map((row) => [row.id, row])
    );
    const roles = new Map(
      (roleIds.length
        ? await tx.churchPositionAssignment.findMany({
            where: { id: { in: roleIds }, connection: { userId: ownerId } },
            select: {
              id: true,
              version: true,
              churchId: true,
              connection: { select: { church: { select: { name: true } } } }
            },
            take: 50
          })
        : []
      ).map((row) => [row.id, { ...row, church: row.connection.church }])
    );
    for (const event of access) {
      const row = (event.kind === "CHURCH_ROLE" ? roles : direct).get(
        event.sourceId!
      );
      if (row && row.version >= (event.sourceVersion ?? Infinity))
        add(
          event,
          "church",
          "/platform/my-church",
          `church-access:${row.churchId}`,
          `Your role or access at ${row.church.name} changed`
        );
    }
  }
  const volunteerRequests = events.filter(
    (e) => e.kind === "VOLUNTEER_REQUEST"
  );
  if (volunteerRequests.length) {
    const slots = await tx.postVolunteerSlot.findMany({
      where: {
        id: { in: volunteerRequests.map((e) => e.sourceId!) },
        closedAt: null
      },
      select: {
        id: true,
        postId: true,
        version: true,
        post: {
          select: {
            eventOccurrence: {
              select: {
                canceledAt: true,
                endAt: true,
                event: { select: { canceledAt: true } }
              }
            }
          }
        }
      },
      take: 50
    });
    for (const e of volunteerRequests) {
      const slot = slots.find(
          (s) => s.id === e.sourceId && s.postId === e.postId
        ),
        p = slot ? posts.get(slot.postId) : null,
        event = slot?.post.eventOccurrence,
        bell = p?.authorChurchId
          ? bells.find((b) => b.churchId === p.authorChurchId)
          : null;
      if (
        slot &&
        p?.authorChurchId &&
        context.churches.includes(p.authorChurchId) &&
        !mutedPost(p) &&
        event &&
        !event.canceledAt &&
        !event.event.canceledAt &&
        event.endAt > now &&
        slot.version >= (e.sourceVersion ?? Infinity) &&
        e.actorId !== ownerId &&
        bell?.authorBellSince &&
        bell.authorBellSince < e.createdAt
      )
        add(
          e,
          "commitments",
          `/platform/posts/${p.id}#volunteer-${slot.id}`,
          `slot:${slot.id}`
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
        dateFormat: true,
        timeFormat: true,
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
          add(
            e,
            "commitments",
            `/platform/events/${o.id}`,
            `event:${o.id}`,
            o.event.calendar.church
              ? `An event from ${o.event.calendar.church.name} in your commitments changed`
              : undefined
          );
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
          add(
            e,
            "commitments",
            `/platform/commitments?signup=${r.id}`,
            `signup:${r.id}`
          );
        } else if (
          details(r.slot.post.eventOccurrenceId) &&
          posts.has(r.slot.postId) &&
          r.slot.version >= (e.sourceVersion ?? Infinity)
        )
          add(
            e,
            "commitments",
            `/platform/posts/${r.slot.postId}#volunteer-${r.slot.id}`,
            `slot:${r.slot.id}`
          );
      }
    }
  }
  return result;
}
