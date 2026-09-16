import { currentExchangeInquiry } from "./exchange-handoff-policy";
import { projectClaimAuthority, claimScopes } from "./church-claim-data";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { hashSessionToken } from "./auth";
import { requireAccountCredential } from "./account-credential";
import { projectListingData } from "./church-listing-data";
import { validImageCrop } from "./image-crop";
import { isEligible } from "./portal-policy";
import { adultMemberWhere } from "./adult-message-policy";
import { METRIC_RAW_DAYS } from "./metric-policy";

const EXPORT_SECONDS = 60;
const MAX_ROWS = 2000;
const MAX_BYTES = 4 * 1024 * 1024;
export class AccountExportError extends Error {
  code: "authorization" | "size";
  constructor(code: "authorization" | "size") {
    super("Account export unavailable");
    this.code = code;
  }
}
function signature(
  secret: string,
  session: string,
  version: number,
  value: string
) {
  return createHmac("sha256", secret)
    .update(
      `account-export-v1:${hashSessionToken(session)}:${version}:${value}`
    )
    .digest("base64url");
}
function checkProof(
  proof: unknown,
  token: string,
  version: number,
  secret: string
) {
  if (
    typeof proof !== "string" ||
    !/^\d{13}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/.test(proof)
  )
    throw new AccountExportError("authorization");
  const [expires, nonce, actual] = proof.split(".");
  const time = Number(expires);
  if (
    time <= Date.now() ||
    time > Date.now() + EXPORT_SECONDS * 1000 ||
    !timingSafeEqual(
      Buffer.from(actual),
      Buffer.from(signature(secret, token, version, `${expires}.${nonce}`))
    )
  )
    throw new AccountExportError("authorization");
}
export async function prepareAccountExport(
  db: PrismaClient,
  token: unknown,
  password: unknown,
  secret: string
) {
  return withOwnedSession(db, token, async (tx, session) => {
    await requireAccountCredential(tx, session, password, "prepare-export");
    const expiresAt = Date.now() + EXPORT_SECONDS * 1000;
    const value = `${expiresAt}.${randomBytes(16).toString("base64url")}`;
    return {
      authorization: `${value}.${signature(secret, token as string, session.credentialVersion, value)}`,
      expiresAt: new Date(expiresAt).toISOString()
    };
  });
}

export async function downloadAccountExport(
  db: PrismaClient,
  token: unknown,
  proof: unknown,
  secret: string
) {
  return withOwnedSession(db, token, async (tx, session) => {
    checkProof(proof, token as string, session.credentialVersion, secret);
    const userId = session.userId;
    // Explicit projections are the export contract. Never serialize a complete
    // ORM account, session, capability, audit or related participant record.
    const account = await tx.platformUser.findUniqueOrThrow({
      where: { id: userId },
      select: {
        createdAt: true,
        updatedAt: true,
        name: true,
        username: true,
        email: true,
        emailVerifiedAt: true,
        metricCreationMethod: true,
        dateFormat: true,
        timeFormat: true,
        regionalVersion: true,
        locationAudience: true,
        locationRecoveryRequired: true,
        role: true,
        bio: true,
        location: true,
        website: true,
        interests: true,
        presentation: {
          select: {
            version: true,
            palette: true,
            background: true,
            sectionOrder: true,
            introduction: true
          }
        },
        adultAcknowledgedAt: true,
        adultPolicyVersion: true,
        googleIdentity: {
          select: { issuer: true, subject: true, createdAt: true }
        }
      }
    });
    const posts = await tx.platformPost.findMany({
      where: { authorId: userId, authorChurchId: null },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        audience: true,
        audienceChurchId: true,
        status: true,
        version: true,
        editedAt: true,
        topics: true,
        welcomeThread: { select: { purpose: true } },
        discoveryLanguage: true,
        discoveryDenomination: true,
        discoveryCountry: true,
        discoveryPlaceId: true,
        replyAudience: true,
        discussionClosed: true,
        allowReposts: true,
        repostKind: true,
        repostSourceId: true,
        createdAt: true,
        updatedAt: true,
        type: true,
        content: true,
        contentNote: true,
        safeExcerpt: true,
        scripture: true,
        linkUrl: true,
        linkTitle: true,
        linkDescription: true,
        linkSourceUrl: true
      }
    });
    const exchangeListings = await tx.exchangeListing.findMany({
      where: { ownerId: userId, ownerChurchId: null },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        state: true,
        moderationState: true,
        intent: true,
        title: true,
        description: true,
        category: true,
        condition: true,
        currency: true,
        priceMinor: true,
        country: true,
        placeId: true,
        requestedItems: true,
        neededBy: true,
        serviceArea: true,
        availability: true,
        qualifications: true,
        servicePricing: true,
        serviceUnit: true,
        placeLabel: true,
        audience: true,
        audienceChurchId: true,
        publishedAt: true,
        confirmedAt: true,
        itemPolicy: true,
        recoveryRequired: true
      }
    });
    const photoAlbums = await tx.photoAlbum.findMany({
      where: { ownerId: userId },
      orderBy: { id: "asc" },
      take: 51,
      select: {
        id: true,
        name: true,
        version: true,
        audience: true,
        audienceChurchId: true,
        coverAssetId: true,
        entries: {
          orderBy: { position: "asc" },
          take: 101,
          select: { assetId: true, position: true }
        }
      }
    });
    if (
      photoAlbums.length > 50 ||
      photoAlbums.some((album) => album.entries.length > 100)
    )
      throw new AccountExportError("size");
    const photoReferences = await tx.postPhotoReference.findMany({
      where: {
        ownerId: userId,
        post: { authorId: userId, authorChurchId: null }
      },
      select: { postId: true, assetId: true, position: true },
      orderBy: [{ postId: "asc" }, { assetId: "asc" }],
      take: MAX_ROWS + 1
    });
    const images = (
      await tx.mediaAsset.findMany({
        where: {
          OR: [
            { profileUserId: userId },
            { post: { authorId: userId, authorChurchId: null } },
            { exchangeListing: { ownerId: userId, ownerChurchId: null } }
          ]
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          purpose: true,
          postId: true,
          exchangeListingId: true,
          createdAt: true,
          updatedAt: true,
          status: true,
          version: true,
          caption: true,
          alt: true,
          position: true,
          crop: true,
          isCurrent: true,
          personalPhoto: {
            select: {
              audience: true,
              audienceChurchId: true,
              hiddenAt: true,
              deletedAt: true,
              version: true
            }
          },
          variants: true
        }
      })
    ).map((image) => ({
      id: image.id,
      purpose: image.purpose,
      postId: image.postId,
      exchangeListingId: image.exchangeListingId,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
      status: image.status,
      version: image.version,
      isCurrent: image.isCurrent,
      personalPhoto: image.personalPhoto,
      caption: image.caption,
      alt: image.alt,
      position: image.position,
      crop: validImageCrop(image.crop)
        ? { x: image.crop.x, y: image.crop.y, zoom: image.crop.zoom }
        : null,
      variants: Object.fromEntries(
        ["original", "large", "medium", "thumb"].flatMap((variant) => {
          const data = image.variants as Record<
            string,
            { width: number; height: number; bytes: number }
          >;
          const size = data[variant];
          return size
            ? [
                [
                  variant,
                  {
                    width: size.width,
                    height: size.height,
                    bytes: size.bytes,
                    url:
                      image.status === "READY"
                        ? `/api/platform/images/${image.id}/${variant}`
                        : null
                  }
                ]
              ]
            : [];
        })
      )
    }));
    const comments = await tx.platformPostComment.findMany({
      where: { authorId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        postId: true,
        createdAt: true,
        content: true,
        parentId: true,
        rootId: true,
        authorChurchId: true,
        version: true,
        editedAt: true,
        deletedAt: true
      }
    });
    const likes = await tx.platformPostLike.findMany({
      where: { userId, active: true },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { postId: true, createdAt: true }
    });
    const following = await tx.platformFollow.findMany({
      where: { followerId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { createdAt: true, following: { select: { username: true } } }
    });
    const churchConnections = await tx.churchConnection.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        state: true,
        createdAt: true,
        updatedAt: true,
        church: { select: { slug: true, name: true } },
        preference: {
          select: {
            listed: true,
            displayName: true,
            contactEmail: true,
            phone: true,
            emailAudience: true,
            phoneAudience: true
          }
        }
      }
    });
    const supportRequests = await tx.supportCase.findMany({
      where: { requesterId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        category: true,
        subject: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        coordinatorShare: { select: { createdAt: true, revokedAt: true } },
        feedback: {
          select: {
            attachments: {
              where: { status: "READY" },
              select: { id: true, caption: true, alt: true, createdAt: true }
            },
            kind: true,
            notice: true,
            rating: true,
            entryPoint: true,
            contactAllowed: true,
            contactInApp: true,
            contactEmail: true,
            contactPush: true,
            contactInAppSince: true,
            contactEmailSince: true,
            contactPushSince: true,
            allowIdea: true,
            publicAttribution: true,
            contextRelease: true,
            contextDevice: true,
            contextBrowser: true,
            contextErrorRef: true,
            createdAt: true,
            redactedAt: true
          }
        }
      }
    });
    const supportMessages = await tx.supportMessage.findMany({
      where: {
        authorId: userId,
        case: { requesterId: userId },
        redactedAt: null
      },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { caseId: true, body: true, createdAt: true }
    });
    const churchListings = (
      await tx.churchListingSubmission.findMany({
        where: { ownerId: userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          kind: true,
          status: true,
          data: true,
          reviewReason: true,
          createdAt: true,
          updatedAt: true,
          church: { select: { id: true, slug: true, name: true } }
        }
      })
    ).map((row) => ({ ...row, data: projectListingData(row.data) }));
    const churchClaims = (
      await tx.churchClaim.findMany({
        where: { ownerId: userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          kind: true,
          status: true,
          authority: true,
          profile: true,
          preparation: true,
          scopes: true,
          reviewReason: true,
          createdAt: true,
          updatedAt: true,
          activatedAt: true,
          church: { select: { id: true, slug: true, name: true } }
        }
      })
    ).map((row) => ({
      ...row,
      authority: projectClaimAuthority(row.authority),
      profile: projectListingData(row.profile)
    }));
    const churchClaimSubmissions = (
      await tx.churchClaimDecision.findMany({
        where: { claim: { ownerId: userId }, action: "SUBMIT" },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          claimId: true,
          version: true,
          createdAt: true,
          evidence: true
        }
      })
    ).map((row) => {
      const value =
        row.evidence &&
        typeof row.evidence === "object" &&
        !Array.isArray(row.evidence)
          ? row.evidence
          : {};
      return {
        claimId: row.claimId,
        version: row.version,
        createdAt: row.createdAt,
        authority: projectClaimAuthority(value.authority),
        profile: projectListingData(value.profile),
        scopes: Array.isArray(value.scopes)
          ? value.scopes.filter(
              (scope) =>
                typeof scope === "string" && Object.hasOwn(claimScopes, scope)
            )
          : []
      };
    });
    const personalCalendars = await tx.platformCalendar.findMany({
      where: { ownerId: userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        name: true,
        timeZone: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true
      }
    });
    const personalEvents = await tx.calendarEvent.findMany({
      where: { calendar: { ownerId: userId } },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        calendarId: true,
        title: true,
        description: true,
        location: true,
        onlineUrl: true,
        organizer: true,
        allDay: true,
        timeZone: true,
        startLocal: true,
        endLocal: true,
        weeklyUntil: true,
        canceledAt: true
      }
    });
    const personalOccurrences = await tx.calendarOccurrence.findMany({
      where: { event: { calendar: { ownerId: userId } } },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        id: true,
        eventId: true,
        ordinal: true,
        title: true,
        description: true,
        location: true,
        onlineUrl: true,
        organizer: true,
        allDay: true,
        timeZone: true,
        startLocal: true,
        endLocal: true,
        startAt: true,
        endAt: true,
        isException: true,
        canceledAt: true
      }
    });
    const calendarShares = await tx.calendarShare.findMany({
      where: { calendar: { ownerId: userId } },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        calendarId: true,
        churchId: true,
        level: true,
        createdAt: true,
        revokedAt: true
      }
    });
    const eventShares = await tx.calendarEventShare.findMany({
      where: { event: { calendar: { ownerId: userId } } },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: {
        eventId: true,
        churchId: true,
        level: true,
        createdAt: true,
        revokedAt: true
      }
    });
    const eventResponses = await tx.calendarResponse.findMany({
      where: { userId },
      orderBy: { id: "asc" },
      take: MAX_ROWS + 1,
      select: { occurrenceId: true, state: true, updatedAt: true }
    });
    const measurementCutoff = new Date(Date.now() - METRIC_RAW_DAYS * 86400000);
    const inquiryRows = await tx.exchangeInquiry.findMany({ where: { recoveryRequired: false, bodyPurgedAt: null,
      OR: [{ requesterId: userId, requesterClearedAt: null }, { receiverId: userId, receiverClearedAt: null }] },
      orderBy: { id: "asc" }, take: MAX_ROWS + 1 });
    if (inquiryRows.length > MAX_ROWS) throw new AccountExportError("size");
    const exchangeInquiries = [];
    for (const row of inquiryRows) {
      // The account's own inquiry text belongs to its export; another adult's
      // purpose and private pickup text require the current accepted plan.
      const accepted = row.state === "RESERVED" && await currentExchangeInquiry(tx, row);
      exchangeInquiries.push({ id: row.id, version: row.version, state: row.state, createdAt: row.createdAt, endedAt: row.endedAt,
        purpose: row.requesterId === userId || accepted ? row.purpose : "",
        ...(accepted ? { windowStart: row.windowStart, windowEnd: row.windowEnd, timeZone: row.timeZone, pickupDetails: row.pickupDetails } : {}) });
    }
    const collections = {
      exchangeInquiries,
      exchangeDefaults: await tx.exchangeDefaults.findMany({ where: { ownerId: userId, recoveryRequired: false },
        select: { version: true, schema: true, intent: true, audience: true, audienceChurchId: true, country: true, placeId: true, pickupDetails: true, updatedAt: true } }),
      exchangeFavorites: await tx.exchangeFavorite.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        // Private organization only. Do not export another person's source or location.
        select: { id: true, version: true, createdAt: true, updatedAt: true }
      }),
      exchangeSavedSearches: await tx.exchangeSavedSearch.findMany({
        where: { ownerId: userId, deletedAt: null, recoveryRequired: false },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          name: true,
          schema: true,
          criteria: true,
          alertsSince: true,
          version: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      photoTags: await tx.photoTag.findMany({
        where: { OR: [{ requesterId: userId }, { recipientId: userId }] },
        select: {
          id: true,
          assetId: true,
          requesterId: true,
          recipientId: true,
          state: true,
          version: true,
          imageVersion: true,
          audienceChurchId: true,
          createdAt: true,
          updatedAt: true,
          decidedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      postMentions: await tx.postMention.findMany({
        where: {
          OR: [
            { recipientId: userId },
            { post: { authorId: userId, authorChurchId: null } }
          ]
        },
        select: {
          id: true,
          postId: true,
          recipientId: true,
          active: true,
          createdAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      privatePostDrafts: await tx.privatePostDraft.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          payload: true,
          version: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      savedPostCollections: await tx.savedPostCollection.findMany({
        where: { ownerId: userId, deletedAt: null },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          name: true,
          version: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      savedPostItems: await tx.savedPostItem.findMany({
        where: { ownerId: userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        // Export the owner's organization only, never a source's former content or identity.
        select: {
          id: true,
          collectionId: true,
          version: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      personalPolls: await tx.postPoll.findMany({
        where: { post: { authorId: userId, authorChurchId: null } },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          postId: true,
          question: true,
          multiple: true,
          closesAt: true,
          closesLocal: true,
          timeZone: true,
          closedAt: true,
          version: true,
          options: {
            select: { id: true, label: true, position: true },
            orderBy: { position: "asc" }
          }
        }
      }),
      pollBallots: await tx.postPollBallot.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          pollId: true,
          optionIds: true,
          version: true,
          updatedAt: true
        }
      }),
      volunteerSignups: await tx.postVolunteerSignup.findMany({
        where: { userId },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1,
        select: {
          id: true,
          slotId: true,
          state: true,
          version: true,
          eventVersion: true,
          occurrenceVersion: true,
          updatedAt: true
        }
      }),
      personalCalendars,
      personalEvents,
      personalOccurrences,
      calendarShares,
      eventShares,
      eventResponses,
      churchClaimSubmissions,
      churchClaims,
      churchListings,
      posts,
      exchangeListings,
      images,
      photoReferences,
      photoAlbums,
      activityReadState: (
        await tx.socialEvent.findMany({
          where: { recipientId: userId },
          select: {
            id: true,
            activitySequence: true,
            activityReadAt: true,
            activityMarkedUnreadAt: true
          },
          orderBy: { activitySequence: "asc" },
          take: MAX_ROWS + 1
        })
      ).map((row) => ({
        ...row,
        activitySequence: row.activitySequence.toString()
      })),
      socialPreferences: (
        await tx.socialPreferences.findMany({
          where: { ownerId: userId },
          select: {
            feedMode: true,
            feedVersion: true,
            discovery: true,
            discoveryVersion: true,
            discoveryRecoveryRequired: true,
            onboardingDismissed: true,
            onboardingVersion: true,
            profilePinPostId: true,
            profilePinVersion: true,
            mentions: true,
            photoTagRequests: true,
            photoTagVersion: true,
            photoTagRecoveryRequired: true,
            contactRequests: true,
            requestAlerts: true,
            activityReadThrough: true,
            messageAlerts: true,
            reportAlerts: true,
            founderAnnouncements: true,
            pushCategories: true,
            notificationVersion: true,
            notificationRecoveryRequired: true,
            feedbackEmailSince: true,
            mutedNotificationCategories: true,
            notificationPushSince: true,
            conversationPushSince: true,
            prayerPushSince: true,
            quietStart: true,
            quietEnd: true,
            quietTimeZone: true,
            showRelationships: true,
            version: true,
            updatedAt: true
          },
          take: 1
        })
      ).map((row) => ({
        ...row,
        activityReadThrough: row.activityReadThrough.toString()
      })),
      sentContactRequests: await tx.adultContactRequest.findMany({
        where: { senderId: userId },
        select: {
          id: true,
          recipientId: true,
          purpose: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          conversationId: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      adultConversationChoices: await tx.adultConversationState.findMany({
        where: { ownerId: userId, conversation: adultMemberWhere(userId) },
        select: {
          conversationId: true,
          muted: true,
          archivedAt: true,
          readThrough: true,
          hiddenThrough: true,
          version: true
        },
        orderBy: { conversationId: "asc" },
        take: MAX_ROWS + 1
      }),
      adultMessages: isEligible({
        ...account,
        suspendedAt: null,
        deactivatedAt: null
      })
        ? await tx.$queryRaw<
            Array<{
              id: string;
              conversationId: string;
              senderId: string;
              sequence: number;
              content: string;
              createdAt: Date;
            }>
          >`
            SELECT m."id", m."conversationId", m."senderId", m."sequence", m."content", m."createdAt"
            FROM "AdultMessage" m JOIN "AdultConversation" c ON c."id" = m."conversationId"
            LEFT JOIN "AdultConversationState" s ON s."conversationId" = c."id" AND s."ownerId" = ${userId}
            WHERE (c."participantAId" = ${userId} OR c."participantBId" = ${userId})
              AND m."sequence" > COALESCE(s."hiddenThrough", 0)
            ORDER BY m."conversationId", m."sequence" LIMIT ${MAX_ROWS + 1}`
        : [],
      friendInvitations: await tx.friendInvitation.findMany({
        where: { ownerId: userId },
        select: {
          version: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          revokedAt: true
        },
        take: 1
      }),
      friendAcceptances: await tx.friendAcceptance.findMany({
        where: { recipientId: userId },
        select: {
          inviterId: true,
          invitationVersion: true,
          state: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      socialRelationships: await tx.socialRelationship.findMany({
        where: { ownerId: userId },
        select: {
          targetUserId: true,
          churchId: true,
          authorBellSince: true,
          authorBellVersion: true,
          followingChurch: true,
          favorite: true,
          muted: true,
          snoozedUntil: true,
          blocked: true,
          version: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      communityReports: await tx.communityReport.findMany({
        where: { reporterId: userId },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          targetVersion: true,
          contextVersion: true,
          reason: true,
          details: true,
          status: true,
          version: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      commentDrafts: await tx.privateCommentDraft.findMany({
        where: { ownerId: userId, deletedAt: null },
        select: {
          id: true,
          postId: true,
          replyToId: true,
          authorChurchId: true,
          content: true,
          mentionIds: true,
          version: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      commentLikes: await tx.commentLike.findMany({
        where: { userId, active: true },
        select: { commentId: true, version: true, updatedAt: true },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      prayerGuide: await tx.prayerGuideReceipt.findMany({
        where: { ownerId: userId },
        select: { guideVersion: true, version: true, acceptedAt: true },
        take: 1
      }),
      topicChoices: await tx.topicMembership.findMany({
        where: { userId },
        select: {
          communityId: true,
          joined: true,
          following: true,
          rulesVersion: true,
          moderator: true,
          pendingRole: true,
          restrictedAt: true,
          restrictionReason: true,
          version: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      ownedTopics: await tx.topicCommunity.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          rules: true,
          rulesVersion: true,
          lifecycle: true,
          moderationState: true,
          version: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      prayerChoices: await tx.prayerRecord.findMany({
        where: { ownerId: userId },
        select: {
          postId: true,
          commentId: true,
          acknowledgedAt: true,
          shareName: true,
          savedAt: true,
          updatesSince: true,
          version: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      prayerUpdates: await tx.prayerUpdate.findMany({
        where: { comment: { authorId: userId, authorChurchId: null } },
        select: {
          commentId: true,
          postId: true,
          targetCommentId: true,
          kind: true,
          createdAt: true
        },
        orderBy: { commentId: "asc" },
        take: MAX_ROWS + 1
      }),
      conversationPreferences: await tx.conversationPreference.findMany({
        where: { ownerId: userId },
        select: {
          postId: true,
          mode: true,
          version: true,
          updatedAt: true,
          followedAt: true
        },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      }),
      comments,
      likes,
      following,
      churchConnections,
      supportRequests,
      supportMessages,
      feedbackIdeaVotes: await tx.feedbackIdeaVote.findMany({
        where: { userId },
        select: {
          ideaId: true,
          active: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { ideaId: "asc" },
        take: MAX_ROWS + 1
      }),
      feedbackIdeaSubscriptions: await tx.feedbackIdeaSubscription.findMany({
        where: { userId },
        select: {
          ideaId: true,
          inAppSince: true,
          emailSince: true,
          pushSince: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { ideaId: "asc" },
        take: MAX_ROWS + 1
      }),
      feedbackPromptPreferences: await tx.feedbackPromptPreference.findMany({
        where: { userId },
        select: {
          neverAskAt: true,
          shownUntil: true,
          dismissedUntil: true,
          respondedUntil: true,
          updatedAt: true
        }
      }),
      feedbackPromptHistory: await tx.feedbackPromptClaim.findMany({
        where: { userId, createdAt: { gte: measurementCutoff } },
        select: {
          campaign: true,
          createdAt: true,
          expiresAt: true,
          shownAt: true,
          finishedAt: true
        },
        orderBy: { createdAt: "asc" },
        take: MAX_ROWS + 1
      }),
      measurementChoice: (
        await tx.platformMeasurementChoice.findMany({
          where: { userId },
          select: {
            policy: true,
            enabledAt: true,
            updatedAt: true,
            shareDevice: true,
            referral: true,
            sessionStarts: true,
            cohortEligible: true,
            onboardingStartedAt: true,
            onboardingCompletedAt: true,
            onboardingSkippedAt: true
          }
        })
      ).map((row) => ({
        ...row,
        sessionStarts: row.sessionStarts.filter(
          (at) => at >= measurementCutoff
        ),
        onboardingStartedAt:
          row.onboardingStartedAt &&
          row.onboardingStartedAt >= measurementCutoff
            ? row.onboardingStartedAt
            : null,
        onboardingCompletedAt:
          row.onboardingCompletedAt &&
          row.onboardingCompletedAt >= measurementCutoff
            ? row.onboardingCompletedAt
            : null,
        onboardingSkippedAt:
          row.onboardingSkippedAt &&
          row.onboardingSkippedAt >= measurementCutoff
            ? row.onboardingSkippedAt
            : null
      })),
      measuredForegroundDays: (
        await tx.platformMetricActivityDay.findMany({
          where: {
            userId,
            lastAt: { gte: measurementCutoff }
          },
          select: {
            version: true,
            day: true,
            firstAt: true,
            lastAt: true,
            device: true,
            browser: true
          },
          orderBy: [{ day: "asc" }, { version: "asc" }],
          take: MAX_ROWS + 1
        })
      ).map((row) => ({
        ...row,
        firstAt: row.firstAt < measurementCutoff ? row.lastAt : row.firstAt
      })),
      privateAdminViews: await tx.adminSavedView.findMany({
        where: { userId },
        select: { name: true, filters: true, createdAt: true, updatedAt: true },
        orderBy: { id: "asc" },
        take: MAX_ROWS + 1
      })
    };
    if (Object.values(collections).some((rows) => rows.length > MAX_ROWS))
      throw new AccountExportError("size");
    const content = JSON.stringify(
      {
        format: "godschurches-account-export",
        version: 1,
        generatedAt: new Date().toISOString(),
        scope:
          "Your account profile, presentation preferences and linked Google identity, authored community content, your personal Exchange listings and their image metadata, your private Exchange favorites, saved-search choices and personal defaults, retained inquiry receipts and currently agreed pickup plans (other people’s listing content excluded), personal image metadata and photo albums, personal polls and your own ballots and volunteer signups, likes/following, your own topic memberships and private following choices, owned topic details, private social, conversation and prayer choices and your own prayer update labels (source content excluded), and friend invitation records, private comment drafts and comment Likes, private post drafts and saved collection organization (source posts excluded), church directory choices, your own church representative setup and listing drafts/submissions, personal calendars/events and their sharing choices, your event responses, your own sent contact requests and currently authorized accepted conversation messages, your own community reports and your own support submissions, current optional measurement choices and retained foreground-use facts. Other people's content outside your accepted conversations, staff/church operations, credentials, session data and security audit records and private report-review notes are excluded. Cleared message history is excluded from your view; this does not erase the other participant's history. Image binaries are not embedded; image references still require current access. Reading preferences saved only on this browser are not in this account file.",
        account,
        ...collections
      },
      null,
      2
    );
    if (Buffer.byteLength(content, "utf8") > MAX_BYTES)
      throw new AccountExportError("size");
    checkProof(proof, token as string, session.credentialVersion, secret);
    return content;
  });
}
