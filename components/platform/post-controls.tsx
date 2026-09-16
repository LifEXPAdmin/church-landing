"use client";
import { RegionalWallTime, RegionalTime } from "./regional-presentation";
import { useEffect, useId, useState } from "react";
import type { PostEditorView } from "@/lib/platform/post-editor";
import { CommentMentions } from "./comment-mentions";
import { PostGalleryManager } from "./post-gallery-manager";
import { PostActionForm } from "./post-action-form";
import { PostScheduleFields } from "./post-schedule-fields";
import {
  PostDraftFields,
  draftProblem,
  type PostDraft
} from "./post-draft-fields";
import { portalInputClass } from "./portal-action-form";
import { discussionModerationReasons } from "@/lib/platform/post-discussion-options";
import { WelcomePostLabel } from "./welcome-post-label";

function EditPost({ post, owner }: { post: PostEditorView; owner: string }) {
  const id = useId(),
    [draft, setDraft] = useState<PostDraft>({
      discovery: post.discovery,
      mentionIds: post.mentionIds,
      content: post.content,
      contentNote: post.contentNote,
      safeExcerpt: post.safeExcerpt,
      scripture: post.scripture,
      type: post.type,
      topics: post.topics,
      audience: post.audience,
      linkUrl: post.linkUrl ?? "",
      keepLinkPreview: !!post.linkSourceUrl,
      linkPreview: post.linkSourceUrl
        ? {
            title: post.linkTitle,
            description: post.linkDescription,
            sourceUrl: post.linkSourceUrl
          }
        : null
    });
  const [baseAudience, setBaseAudience] = useState(post.audience),
    [confirmation, setConfirmation] = useState(false),
    [allowReposts, setAllowReposts] = useState(post.allowReposts);
  return (
    <PostActionForm
      owner={owner}
      returnHref={
        post.status !== "PUBLISHED"
          ? `/platform/scheduled-posts/${post.id}`
          : undefined
      }
      payload={{
        operation: "edit",
        postId: post.id,
        expectedVersion: post.version
      }}
      label="Save post changes"
      fields={() => ({
        ...draft,
        allowReposts,
        confirmAudienceChange: confirmation
      })}
      validate={() => draftProblem(draft)}
      onLatest={(latest) => {
        setBaseAudience(latest.audience);
        setConfirmation(false);
      }}
      onSuccess={() => {
        setBaseAudience(draft.audience);
        setConfirmation(false);
      }}
    >
      <p>
        Speaking as <strong>{post.authorName}</strong>.{" "}
        {post.churchName && `Shared on ${post.churchName}'s page.`}
      </p>
      <PostDraftFields draft={draft} change={setDraft} />
      <CommentMentions
        resolveSelections
        owner={owner}
        ids={draft.mentionIds ?? []}
        onChange={(mentionIds) => setDraft({ ...draft, mentionIds })}
      />
      {!post.repostKind && (
        <label className="flex min-h-11 items-start gap-2">
          <input
            type="checkbox"
            checked={allowReposts}
            onChange={(e) => setAllowReposts(e.target.checked)}
          />
          <span>
            Allow people to repost this public post
            <span className="block text-sm font-normal text-gc-muted">
              Reposts keep your attribution. Turning this off hides the original
              in existing reposts. Church-only or restricted event posts cannot
              be reposted.
            </span>
          </span>
        </label>
      )}
      <label htmlFor={id} className="block font-semibold">
        Who can read this post?
      </label>
      <select
        id={id}
        className={portalInputClass}
        value={draft.audience}
        onChange={(e) => {
          setDraft({
            ...draft,
            audience: e.target.value as PostDraft["audience"]
          });
          setConfirmation(false);
        }}
      >
        <option value="PUBLIC">Public · everyone, including guests</option>
        {post.churchId && (
          <option value="CHURCH">Approved members of {post.churchName}</option>
        )}
      </select>
      {post.eventAudience === "CHURCH" && (
        <p className="text-sm text-gc-muted">
          The linked event currently limits this post to approved church
          members, including when Public is selected here.
        </p>
      )}
      {draft.audience !== baseAudience && (
        <label className="flex min-h-11 items-start gap-2">
          <input
            type="checkbox"
            required
            checked={confirmation}
            onChange={(e) => setConfirmation(e.target.checked)}
          />
          {draft.audience === "PUBLIC"
            ? "I confirm that this post may be public, including for guests, subject to any linked event's audience."
            : "I confirm that only approved church members may read this post."}
        </label>
      )}
      <p className="text-sm text-gc-muted">
        {post.status === "PUBLISHED"
          ? "Edits keep existing votes and volunteer reservations. Change event details on the event itself. The post will show an Edited label."
          : "Saving content keeps the current publication plan. Cancel its schedule first if you need more time to edit. Change linked event details on the event itself."}
      </p>
    </PostActionForm>
  );
}
function SchedulePost({
  post,
  owner
}: {
  post: PostEditorView;
  owner: string;
}) {
  const [time, setTime] = useState({
    local: post.scheduleLocal,
    zone: post.scheduleZone
  });
  return (
    <section aria-label="Publication plan" className="space-y-4">
      <h3 className="text-xl">Publication plan</h3>
      <p className="break-words">
        {post.status === "SCHEDULED"
          ? <>Scheduled for <RegionalWallTime value={post.scheduleLocal} /> in {post.scheduleZone}.</>
          : "This post is a draft. Review its content and permissions before scheduling publication."}
      </p>
      <PostActionForm
        owner={owner}
        returnHref={`/platform/scheduled-posts/${post.id}`}
        payload={{
          operation: "schedule",
          postId: post.id,
          expectedVersion: post.version
        }}
        label={
          post.status === "SCHEDULED"
            ? "Reschedule publication"
            : "Schedule publication"
        }
        fields={() => ({ scheduleLocal: time.local, scheduleZone: time.zone })}
      >
        <PostScheduleFields
          local={time.local}
          zone={time.zone}
          change={(local, zone) => setTime({ local, zone })}
        />
      </PostActionForm>
      {post.status === "SCHEDULED" && (
        <PostActionForm
          owner={owner}
          returnHref={`/platform/scheduled-posts/${post.id}`}
          payload={{
            operation: "cancel-schedule",
            postId: post.id,
            expectedVersion: post.version
          }}
          label="Cancel publication schedule"
        >
          <p>
            The content stays as a church draft. It will not publish until a
            publisher schedules it again.
          </p>
        </PostActionForm>
      )}
    </section>
  );
}
export function PostControls({
  post,
  ownerId
}: {
  post: PostEditorView;
  ownerId: string;
}) {
  const [photosOpened, setPhotosOpened] = useState(false),
    [welcomeOpened, setWelcomeOpened] = useState(false);
  useEffect(() => {
    const reveal = () => {
      if (
        !["#post-edit", "#post-remove", "#post-discussion"].includes(
          location.hash
        )
      )
        return;
      const section = document.getElementById(location.hash.slice(1));
      if (section instanceof HTMLDetailsElement) {
        section.open = true;
        section.scrollIntoView({ block: "start" });
        section
          .querySelector<HTMLElement>("textarea, input, button")
          ?.focus({ preventScroll: true });
      }
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);

  const id = useId();
  return (
    <section
      aria-label="Manage post"
      className="space-y-4 rounded-xl border border-gc-divider p-4"
    >
      <h2 className="text-2xl">Manage post</h2>
      {post.canEdit &&
        post.churchId &&
        post.status === "PUBLISHED" &&
        !post.repostKind &&
        !post.topicCommunityId && (
          <details onToggle={(e) => setWelcomeOpened(e.currentTarget.open)}>
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Welcome and questions
            </summary>
            <WelcomePostLabel
              ownerId={ownerId}
              churchId={post.churchId}
              postId={post.id}
              active={welcomeOpened}
            />
          </details>
        )}
      {post.canEdit && post.churchAuthor && post.status !== "PUBLISHED" && (
        <SchedulePost post={post} owner={ownerId} />
      )}
      {post.canEdit && (
        <details id="post-edit" className="scroll-mt-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Edit post
          </summary>
          <EditPost post={post} owner={ownerId} />
        </details>
      )}
      {post.canEdit && ownerId && post.status === "PUBLISHED" && (
        <details
          onToggle={(event) => {
            if (event.currentTarget.open) setPhotosOpened(true);
          }}
        >
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Manage photos
          </summary>
          {photosOpened && (
            <PostGalleryManager postId={post.id} ownerId={ownerId} />
          )}
        </details>
      )}
      {post.canDiscuss && (
        <details id="post-discussion" className="scroll-mt-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Discussion settings
          </summary>
          <PostActionForm
            owner={ownerId}
            returnHref={
              post.status !== "PUBLISHED"
                ? `/platform/scheduled-posts/${post.id}`
                : undefined
            }
            payload={{
              operation: "discussion",
              postId: post.id,
              expectedVersion: post.version
            }}
            label="Save discussion settings"
            fields={(data) => ({
              closed: data.has("closed"),
              replyAudience: data.get("replyAudience"),
              ...(!post.canEdit
                ? { moderationReason: data.get("moderationReason") }
                : {})
            })}
          >
            <label className="flex min-h-11 items-center gap-2">
              <input
                name="closed"
                type="checkbox"
                defaultChecked={post.discussionClosed}
              />
              Close this discussion to new replies
            </label>
            <label htmlFor={`${id}-replies`} className="block font-semibold">
              Who may reply?
            </label>
            <select
              id={`${id}-replies`}
              name="replyAudience"
              defaultValue={post.replyAudience}
              className={portalInputClass}
            >
              <option value="VIEWERS">
                {post.topicCommunityId
                  ? "Joined topic members who accept the current rules"
                  : "Eligible viewers with an account"}
              </option>
              {post.churchId && (
                <option value="CHURCH_MEMBERS">
                  Approved church members only
                </option>
              )}
            </select>
            {!post.canEdit && (
              <div className="space-y-2">
                <label
                  htmlFor={`${id}-moderation-reason`}
                  className="block font-semibold"
                >
                  Reason for moderation changes
                </label>
                <select
                  id={`${id}-moderation-reason`}
                  name="moderationReason"
                  required
                  defaultValue=""
                  className={portalInputClass}
                >
                  <option value="">Choose a reason</option>
                  {Object.entries(discussionModerationReasons).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
                <p className="text-sm text-gc-muted">
                  You are changing these settings as a church moderator. The
                  reason and settings are recorded for the post&apos;s
                  authorized managers.
                </p>
              </div>
            )}
            <p className="text-sm text-gc-muted">
              Existing comments remain readable. Reply settings cannot widen the
              post&apos;s audience.
            </p>
          </PostActionForm>
          {post.discussionModeration.length > 0 && (
            <section
              aria-label="Recent discussion moderation"
              className="mt-5 space-y-3 border-t border-gc-border pt-4"
            >
              <h3 className="font-semibold">Recent moderation decisions</h3>
              <p className="text-sm text-gc-muted">
                The latest ten decisions for this post. Current access is
                required to view this history.
              </p>
              <ol className="space-y-4">
                {post.discussionModeration.map((decision) => (
                  <li key={decision.id} className="space-y-1 text-sm">
                    <p className="font-semibold">{decision.reason}</p>
                    <p>
                      {decision.actor} ·{" "}
                      <time dateTime={decision.createdAt}>
                        <RegionalTime value={decision.createdAt} defaultText={decision.createdAt.slice(0, 16).replace("T", " ")} options={{year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC"}} /> UTC
                      </time>
                    </p>
                    <p>
                      {decision.before} → {decision.after}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </details>
      )}
      {post.canPin && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Pin church notice
          </summary>
          <PostActionForm
            owner={ownerId}
            payload={{
              operation: "pin",
              postId: post.id,
              expectedVersion: post.version
            }}
            label="Save notice pin"
            fields={(data) => ({
              until: data.has("removePin")
                ? null
                : String(data.get("until")) + ":00.000Z"
            })}
          >
            <label htmlFor={`${id}-until`} className="block font-semibold">
              Pin expiry (UTC)
            </label>
            <input
              id={`${id}-until`}
              name="until"
              type="datetime-local"
              defaultValue={post.pinUntil?.slice(0, 16) ?? ""}
              className={portalInputClass}
            />
            <label className="flex min-h-11 items-center gap-2">
              <input name="removePin" type="checkbox" />
              Remove the pin
            </label>
            <p className="text-sm text-gc-muted">
              Up to three active church notices, for up to 90 days. Expiry
              removes the pin; the post stays available to its audience.
            </p>
          </PostActionForm>
        </details>
      )}
      {post.canWithdraw && (
        <details id="post-remove" className="scroll-mt-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Remove post
          </summary>
          <PostActionForm
            owner={ownerId}
            payload={{
              operation: "withdraw",
              postId: post.id,
              expectedVersion: post.version
            }}
            label="Confirm removal"
            returnHref={
              post.status !== "PUBLISHED"
                ? `/platform/scheduled-posts/${post.id}`
                : undefined
            }
            fields={(data) => ({ confirmed: data.has("confirmed") })}
          >
            <label className="flex min-h-11 items-start gap-2">
              <input name="confirmed" type="checkbox" required />
              Remove this post and its discussion from view.
            </label>
            <p className="text-sm text-gc-muted">
              This cannot be undone here. Existing volunteer reservations can
              still be canceled from My commitments.
            </p>
          </PostActionForm>
        </details>
      )}
    </section>
  );
}
