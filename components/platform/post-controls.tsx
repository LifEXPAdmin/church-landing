"use client";
import { useId, useState } from "react";
import type { PostEditorView } from "@/lib/platform/post-editor";
import { PostGalleryManager } from "./post-gallery-manager";
import { PostActionForm } from "./post-action-form";
import {
  PostDraftFields,
  draftProblem,
  type PostDraft
} from "./post-draft-fields";
import { portalInputClass } from "./portal-action-form";

function EditPost({ post }: { post: PostEditorView }) {
  const id = useId(),
    [draft, setDraft] = useState<PostDraft>({
      content: post.content,
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
    [confirmation, setConfirmation] = useState(false);
  return (
    <PostActionForm
      payload={{
        operation: "edit",
        postId: post.id,
        expectedVersion: post.version
      }}
      label="Save post changes"
      fields={() => ({ ...draft, confirmAudienceChange: confirmation })}
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
        Edits keep existing votes and volunteer reservations. Change event
        details on the event itself. The post will show an Edited label.
      </p>
    </PostActionForm>
  );
}
export function PostControls({
  post,
  ownerId
}: {
  post: PostEditorView;
  ownerId?: string;
}) {
  const [photosOpened, setPhotosOpened] = useState(false);
  const id = useId();
  return (
    <section
      aria-label="Manage post"
      className="space-y-4 rounded-xl border border-gc-divider p-4"
    >
      <h2 className="text-2xl">Manage post</h2>
      {post.canEdit && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Edit post
          </summary>
          <EditPost post={post} />
        </details>
      )}
      {post.canEdit && ownerId && (
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
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Discussion settings
          </summary>
          <PostActionForm
            payload={{
              operation: "discussion",
              postId: post.id,
              expectedVersion: post.version
            }}
            label="Save discussion settings"
            fields={(data) => ({
              closed: data.has("closed"),
              replyAudience: data.get("replyAudience")
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
              <option value="VIEWERS">Eligible viewers with an account</option>
              {post.churchId && (
                <option value="CHURCH_MEMBERS">
                  Approved church members only
                </option>
              )}
            </select>
            <p className="text-sm text-gc-muted">
              Existing comments remain readable. Reply settings cannot widen the
              post&apos;s audience.
            </p>
          </PostActionForm>
        </details>
      )}
      {post.canPin && (
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Pin church notice
          </summary>
          <PostActionForm
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
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold">
            Remove post
          </summary>
          <PostActionForm
            payload={{
              operation: "withdraw",
              postId: post.id,
              expectedVersion: post.version
            }}
            label="Confirm removal"
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
