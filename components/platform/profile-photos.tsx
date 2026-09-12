"use client";
/* eslint-disable @next/next/no-img-element -- Permissioned media uses no shared optimizer. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { readPersonalPhotos } from "@/lib/platform/personal-photos";
import type { PostComposerOptions } from "@/lib/platform/post-editor";
import type { ImageView } from "@/lib/platform/media";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { PhotoViewer } from "./photo-viewer";
import { PhotoUploadManager } from "./photo-upload-manager";
import { useReadingPreferences } from "./reading-preferences";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";
import { portalButtonClass, portalInputClass } from "./portal-action-form";
type Library = Awaited<ReturnType<typeof readPersonalPhotos>>;
type Photo = Library["images"][number];
const audienceLabels = {
  ONLY_ME: "Only me",
  MEMBERS: "Signed-in members",
  PUBLIC: "Public, including guests",
  CHURCH: "Approved church members",
  SOURCE: "Source post audience"
};

function ManagePhoto({
  photo,
  current,
  ownerId,
  churches,
  done,
  close
}: {
  photo: Photo;
  current: Library["current"];
  ownerId: string;
  churches: PostComposerOptions["churches"];
  done: () => Promise<void>;
  close: () => void;
}) {
  const [mode, setMode] = useState<"details" | "audience">("details"),
    [caption, setCaption] = useState(photo.caption),
    [alt, setAlt] = useState(photo.alt),
    [audience, setAudience] = useState(photo.audience),
    [churchId, setChurchId] = useState(photo.audienceChurchId ?? ""),
    [confirmed, setConfirmed] = useState(false),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [retry, setRetry] = useState(false);
  const pending = useRef<string | null>(null),
    lock = useRef(false);
  const dirty =
    caption !== photo.caption ||
    alt !== photo.alt ||
    audience !== photo.audience ||
    churchId !== (photo.audienceChurchId ?? "");
  useUnsavedSocialWork(
    { dirty, saving: busy, conflict: retry },
    () => setMessage("Save or discard these photo changes before leaving."),
    true
  );
  async function command(operation?: string) {
    if (lock.current) return;
    if (!pending.current) {
      if (!operation) return;
      const selected = current.find((row) => row.purpose === photo.purpose);
      pending.current = JSON.stringify({
        operation,
        mutationId: crypto.randomUUID(),
        imageId: photo.id,
        expectedVersion: photo.photoVersion,
        imageVersion: photo.version,
        ...(operation === "metadata"
          ? { caption, alt }
          : operation === "audience"
            ? {
                audience,
                audienceChurchId: audience === "CHURCH" ? churchId : null,
                confirmed
              }
            : operation === "select"
              ? {
                  currentId: selected?.id ?? null,
                  currentVersion: selected?.version ?? 0
                }
              : operation === "delete"
                ? { confirmed: true }
                : {})
      });
    }
    lock.current = true;
    setBusy(true);
    setMessage("Saving photo change…");
    try {
      await socialRequest("/api/platform/photos", pending.current, ownerId);
      pending.current = null;
      setRetry(false);
      await done();
      close();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The save was not confirmed. Retry the same change."
      );
      setRetry(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border-2 border-gc-accent p-4"
      aria-label="Manage selected photo"
    >
      <h3 className="text-2xl">Manage selected photo</h3>
      <p>
        {audienceLabels[photo.audience]}
        {photo.current ? " · Current picture" : ""}
      </p>
      <p role="status">{message}</p>
      {!photo.sourcePostId && (
        <>
          {photo.purpose === "PROFILE_PHOTO" && (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className={portalButtonClass}
                disabled={dirty || retry || busy}
                onClick={() => setMode("details")}
              >
                Caption and description
              </button>
              <button
                type="button"
                className={portalButtonClass}
                disabled={dirty || retry || busy}
                onClick={() => setMode("audience")}
              >
                Sharing audience
              </button>
            </div>
          )}
          {mode === "details" ? (
            <fieldset className="min-w-0 space-y-2" disabled={busy || retry}>
              <label htmlFor="managed-photo-caption" className="block">
                Caption
              </label>
              <textarea
                id="managed-photo-caption"
                className={portalInputClass}
                rows={3}
                maxLength={500}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
              />
              <label htmlFor="managed-photo-alt" className="block">
                Image description for screen readers
              </label>
              <input
                id="managed-photo-alt"
                className={portalInputClass}
                maxLength={300}
                value={alt}
                onChange={(event) => setAlt(event.target.value)}
              />
              <button
                type="button"
                className={portalButtonClass}
                onClick={() => void command("metadata")}
              >
                Save photo details
              </button>
            </fieldset>
          ) : (
            <fieldset className="min-w-0 space-y-3" disabled={busy || retry}>
              <label htmlFor="managed-photo-audience" className="block">
                Who can view this photo?
              </label>
              <select
                id="managed-photo-audience"
                className={portalInputClass}
                value={audience}
                onChange={(event) => {
                  setAudience(event.target.value as Photo["audience"]);
                  setConfirmed(false);
                }}
              >
                <option value="ONLY_ME">Only me</option>
                <option value="MEMBERS">Signed-in members</option>
                <option value="PUBLIC">Public, including guests</option>
                <option value="CHURCH">Approved church members</option>
              </select>
              {audience === "CHURCH" && (
                <label className="block">
                  Church
                  <select
                    className={portalInputClass}
                    value={churchId}
                    onChange={(event) => setChurchId(event.target.value)}
                  >
                    <option value="">Choose a church</option>
                    {churches.map((church) => (
                      <option key={church.id} value={church.id}>
                        {church.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {audience === "PUBLIC" && (
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />
                  I understand people who are not signed in can view this photo.
                </label>
              )}
              <p className="text-sm">
                Changing this photo&apos;s audience also limits it in existing
                posts and albums.
              </p>
              <button
                type="button"
                className={portalButtonClass}
                disabled={audience === "PUBLIC" && !confirmed}
                onClick={() => void command("audience")}
              >
                Save photo audience
              </button>
            </fieldset>
          )}
        </>
      )}
      {photo.sourcePostId && (
        <p>
          This photo follows its source post.{" "}
          <Link
            className="underline"
            href={`/platform/posts/${photo.sourcePostId}`}
          >
            Open the post to edit its photos or audience.
          </Link>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {["PROFILE_AVATAR", "PROFILE_COVER"].includes(photo.purpose) &&
          !photo.current && (
            <button
              type="button"
              className={portalButtonClass}
              disabled={busy || retry || dirty}
              onClick={() => void command("select")}
            >
              Use as current{" "}
              {photo.purpose === "PROFILE_AVATAR"
                ? "profile picture"
                : "cover photo"}
            </button>
          )}
        {!photo.current && (
          <button
            type="button"
            className={portalButtonClass}
            disabled={busy || retry || dirty}
            onClick={() => void command(photo.hidden ? "restore" : "hide")}
          >
            {photo.hidden
              ? "Return to profile Photos"
              : "Hide from profile Photos"}
          </button>
        )}
        {!photo.current && !photo.sourcePostId && (
          <button
            type="button"
            className={portalButtonClass}
            disabled={busy || retry || dirty}
            onClick={() => setDeleting(true)}
          >
            Delete saved photo
          </button>
        )}
      </div>
      {photo.current && (
        <p>
          To remove only the current selection, use Edit profile. The saved
          picture will remain in this collection.
        </p>
      )}
      {deleting && (
        <div className="space-y-3">
          <p>
            Delete this saved photo and schedule its processed files for
            cleanup? A photo still used by a post must be removed from that post
            first.
          </p>
          <button
            type="button"
            className={portalButtonClass}
            disabled={busy || retry}
            onClick={() => void command("delete")}
          >
            Confirm deletion
          </button>
          <button
            type="button"
            className={portalButtonClass}
            onClick={() => setDeleting(false)}
          >
            Keep saved photo
          </button>
        </div>
      )}
      {retry && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => void command()}
        >
          Retry exact photo change
        </button>
      )}
      <button
        type="button"
        className={portalButtonClass}
        disabled={busy}
        onClick={() => {
          close();
          void done();
        }}
      >
        {dirty || retry
          ? "Discard local edits and reload saved photo"
          : "Close photo controls"}
      </button>
    </section>
  );
}
export function ProfilePhotos({
  profileId,
  ownerId,
  preview = false
}: {
  profileId: string;
  ownerId: string;
  preview?: boolean;
}) {
  const router = useRouter(),
    { preferences } = useReadingPreferences();
  const [view, setView] = useState("all"),
    [pages, setPages] = useState<(string | null)[]>([null]),
    [data, setData] = useState<Library | null>(null),
    [message, setMessage] = useState("Loading photos…"),
    [visible, setVisible] = useState(true),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [managed, setManaged] = useState<{
      photo: Photo;
      current: Library["current"];
    } | null>(null);
  const [churches, setChurches] = useState<PostComposerOptions["churches"]>([]),
    [audience, setAudience] = useState("ONLY_ME"),
    [churchId, setChurchId] = useState(""),
    [alsoPost, setAlsoPost] = useState(false),
    [saved, setSaved] = useState<ImageView[]>([]),
    [uploadPending, setUploadPending] = useState(false),
    [postDraft, setPostDraft] = useState<string | null>(null),
    [postBusy, setPostBusy] = useState(false),
    [publicConfirmed, setPublicConfirmed] = useState(false);
  const [postSelections, setPostSelections] = useState<string[]>([]);
  const generation = useRef(0),
    postAttempt = useRef<string | null>(null);
  const after = pages.at(-1),
    source = `/api/platform/photos?${new URLSearchParams({ profileId, view, ...(after ? { after } : {}), ...(preview ? { preview: "member" } : {}) })}`;
  const load = useCallback(async () => {
    const seq = ++generation.current;
    setBusy(true);
    try {
      const result = await socialRequest<Library>(source, undefined, ownerId);
      if (seq !== generation.current) return;
      setData(result.data);
      setVisible(true);
      setMessage(
        result.data.images.length
          ? ""
          : "No photos in this collection are available to you yet."
      );
    } catch (error) {
      if (seq !== generation.current) return;
      setVisible(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Photos could not be loaded. Reconnect and retry."
      );
      if (error instanceof SocialClientError && error.status === 401) {
        setData(null);
        setManaged(null);
        setSaved([]);
        postAttempt.current = null;
        setPostDraft(null);
      }
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [source, ownerId]);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const restore = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : restore();
    restore();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", restore);
    window.addEventListener("online", restore);
    window.addEventListener("social-relationships-changed", restore);
    document.addEventListener("visibilitychange", visibility);
    const invalidate = () => {
      generation.current++;
    };
    return () => {
      invalidate();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", restore);
      window.removeEventListener("online", restore);
      window.removeEventListener("social-relationships-changed", restore);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load]);
  useEffect(() => {
    if (profileId !== ownerId || preview) return;
    let canceled = false;
    socialRequest<PostComposerOptions>(
      "/api/platform/posts?view=composer",
      undefined,
      ownerId
    )
      .then((result) => {
        if (!canceled) setChurches(result.data.churches);
      })
      .catch(() => {});
    return () => {
      canceled = true;
    };
  }, [profileId, ownerId, preview]);
  useUnsavedSocialWork(
    {
      dirty: !!postAttempt.current && !postDraft,
      saving: postBusy,
      conflict: false
    },
    () =>
      setMessage(
        "Finish saving the photo draft, or retry the same draft creation before leaving."
      ),
    true
  );
  async function createPostDraft() {
    if (postBusy || !postSelections.length || uploadPending) return;
    setPostBusy(true);
    try {
      if (!postAttempt.current)
        postAttempt.current = JSON.stringify({
          operation: "save-draft",
          id: crypto.randomUUID(),
          mutationId: crypto.randomUUID(),
          expectedVersion: 0,
          payload: {
            content: "",
            scripture: "",
            replyAudience: "VIEWERS",
            audience: audience === "PUBLIC" ? "PUBLIC" : "CHURCH",
            audienceChurchId: audience === "PUBLIC" ? null : churchId,
            photos: saved
              .filter((image) => postSelections.includes(image.id))
              .map((image) => ({ id: image.id, version: image.version }))
          }
        });
      const result = await socialRequest<{ id: string }>(
        "/api/platform/post-workspace",
        postAttempt.current,
        ownerId
      );
      setPostDraft(result.data.id);
      postAttempt.current = null;
      setMessage(
        "Photos are saved and a private post draft is ready. Open the composer to write and publish it."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Draft save was not confirmed. Retry the same draft creation."
      );
    } finally {
      setPostBusy(false);
    }
  }
  const mutable =
    !managed && !uploadPending && !postBusy && !postAttempt.current;
  return (
    <section
      className="gc-profile-section space-y-5"
      id="photos"
      aria-labelledby="profile-photos-heading"
    >
      <h2 id="profile-photos-heading">Photos</h2>
      <p className="text-gc-muted">
        Browse photos shared with you. Profile and cover pictures are kept in
        their own collections; personal post photos keep their source
        post&apos;s audience.
      </p>
      <p role="status">{message}</p>
      <div hidden={!visible} className="space-y-5">
        <nav aria-label="Photo collections" className="flex flex-wrap gap-3">
          {[
            ["all", "All photos"],
            ["profile", "Profile pictures"],
            ["cover", "Cover photos"],
            ...(data?.canManage ? [["hidden", "Hidden from profile"]] : [])
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={portalButtonClass}
              aria-pressed={view === value}
              disabled={!mutable || busy}
              onClick={() => {
                setView(value);
                setPages([null]);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        {data && (
          <>
            <p>
              {data.total} {data.total === 1 ? "photo" : "photos"} available ·
              page {pages.length}
            </p>
            {data.canManage && (
              <a className={portalButtonClass} href="#add-profile-photos">
                Add photos to your library
              </a>
            )}
            {managed && (
              <ManagePhoto
                key={managed.photo.id}
                photo={managed.photo}
                current={managed.current}
                ownerId={ownerId}
                churches={churches}
                close={() => setManaged(null)}
                done={async () => {
                  await load();
                  router.refresh();
                }}
              />
            )}
            <div className="grid min-w-0 grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {data.images.map((image, index) => (
                <article
                  key={image.id}
                  className="min-w-0 space-y-2 rounded-lg border border-gc-divider p-2"
                >
                  <button
                    type="button"
                    className="block w-full overflow-hidden rounded-md"
                    aria-haspopup="dialog"
                    aria-label={`Open photo ${index + 1} on this page`}
                    onClick={() => setSelected(image.id)}
                  >
                    <img
                      src={image.variants.thumb.url}
                      srcSet={
                        preferences.reduceData ||
                        image.variants.medium.width ===
                          image.variants.thumb.width
                          ? undefined
                          : `${image.variants.thumb.url} ${image.variants.thumb.width}w, ${image.variants.medium.url} ${image.variants.medium.width}w`
                      }
                      sizes="(min-width: 1024px) 240px, (min-width: 640px) 30vw, 44vw"
                      width={image.variants.thumb.width}
                      height={image.variants.thumb.height}
                      alt={image.alt || `Photo ${index + 1}`}
                      className="aspect-square h-auto w-full object-cover"
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.style.visibility = "hidden";
                      }}
                    />
                  </button>
                  {image.caption && (
                    <p className="break-words text-sm">{image.caption}</p>
                  )}
                  <p className="text-xs text-gc-muted">
                    {image.current ? "Current · " : ""}
                    {audienceLabels[image.audience]}
                  </p>
                  {image.sourcePostId && (
                    <Link
                      className="gc-profile-text-button"
                      href={`/platform/posts/${image.sourcePostId}`}
                    >
                      Source post
                    </Link>
                  )}
                  {data.canManage && (
                    <button
                      type="button"
                      className="gc-profile-text-button"
                      disabled={!mutable}
                      onClick={() =>
                        setManaged({ photo: image, current: data.current })
                      }
                    >
                      Manage photo
                    </button>
                  )}
                </article>
              ))}
            </div>
            <nav aria-label="Photo pages" className="flex flex-wrap gap-3">
              <button
                type="button"
                className={portalButtonClass}
                disabled={pages.length === 1 || busy || !mutable}
                onClick={() => setPages((stack) => stack.slice(0, -1))}
              >
                Previous page
              </button>
              <button
                type="button"
                className={portalButtonClass}
                disabled={!data.nextCursor || busy || !mutable}
                onClick={() => setPages((stack) => [...stack, data.nextCursor])}
              >
                Next page
              </button>
            </nav>
            <p className="text-sm text-gc-muted">
              Up to {data.pageSize} photos per page. The library holds up to{" "}
              {data.limit.toLocaleString()} personal photos, separately from a
              post&apos;s ten-photo limit.
            </p>
            {data.canManage && (
              <section id="add-profile-photos" className="space-y-4">
                <h3 className="text-2xl">
                  Save photos to your profile library
                </h3>
                <p>
                  Photos-only saves create no feed post. Only me is private to
                  your account.
                </p>
                <fieldset
                  disabled={uploadPending || !!postAttempt.current}
                  className="min-w-0 space-y-3"
                >
                  <label className="block">
                    Audience for new uploads
                    <select
                      className={portalInputClass}
                      value={audience}
                      onChange={(event) => {
                        setAudience(event.target.value);
                        setPublicConfirmed(false);
                      }}
                    >
                      <option value="ONLY_ME">Only me</option>
                      <option value="MEMBERS">Signed-in members</option>
                      <option value="PUBLIC">Public, including guests</option>
                      <option value="CHURCH">Approved church members</option>
                    </select>
                  </label>
                  {(audience === "CHURCH" ||
                    (alsoPost && audience === "MEMBERS")) && (
                    <label className="block">
                      Church
                      <select
                        className={portalInputClass}
                        value={churchId}
                        onChange={(event) => setChurchId(event.target.value)}
                      >
                        <option value="">Choose a church</option>
                        {churches.map((church) => (
                          <option key={church.id} value={church.id}>
                            {church.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {audience === "PUBLIC" && (
                    <label className="flex gap-2">
                      <input
                        type="checkbox"
                        checked={publicConfirmed}
                        onChange={(event) =>
                          setPublicConfirmed(event.target.checked)
                        }
                      />
                      I understand people who are not signed in can view these
                      photos.
                    </label>
                  )}
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={alsoPost}
                      onChange={(event) => setAlsoPost(event.target.checked)}
                    />
                    Also create a post · open a private draft after saving
                    photos
                  </label>
                </fieldset>
                {alsoPost && (
                  <p className="text-sm">
                    Choose Public or a shared church audience to include photos
                    in a post. The composer still requires your text and
                    deliberate publication. Existing saved photos keep the
                    audience used when each upload started.
                  </p>
                )}
                <PhotoUploadManager
                  ownerId={ownerId}
                  targetId={profileId}
                  purpose="PROFILE_PHOTO"
                  available={
                    data.imagesAvailable &&
                    !managed &&
                    (audience !== "PUBLIC" || publicConfirmed) &&
                    (audience !== "CHURCH" || !!churchId)
                  }
                  remaining={data.capacityRemaining ?? 0}
                  details={{
                    audience,
                    audienceChurchId: audience === "CHURCH" ? churchId : null
                  }}
                  onPending={setUploadPending}
                  onSaved={async (image) => {
                    setPostSelections((previous) =>
                      previous.includes(image.id) || previous.length >= 10
                        ? previous
                        : [...previous, image.id]
                    );
                    setSaved((previous) => [
                      ...new Map(
                        [...previous, image].map((row) => [row.id, row])
                      ).values()
                    ]);
                    await load();
                  }}
                />
                {alsoPost && saved.length > 0 && !postDraft && (
                  <fieldset
                    disabled={postBusy || !!postAttempt.current}
                    className="space-y-2"
                  >
                    <legend>
                      Saved photos for this post ({postSelections.length} / 10)
                    </legend>
                    {saved.map((image, index) => (
                      <label key={image.id} className="flex gap-2">
                        <input
                          type="checkbox"
                          checked={postSelections.includes(image.id)}
                          disabled={
                            !postSelections.includes(image.id) &&
                            postSelections.length >= 10
                          }
                          onChange={(event) =>
                            setPostSelections((previous) =>
                              event.target.checked
                                ? [...previous, image.id]
                                : previous.filter((id) => id !== image.id)
                            )
                          }
                        />
                        {image.caption || `Saved photo ${index + 1}`}
                      </label>
                    ))}
                  </fieldset>
                )}
                {alsoPost && saved.length > 0 && !postDraft && (
                  <button
                    type="button"
                    className={portalButtonClass}
                    disabled={
                      postBusy ||
                      !postSelections.length ||
                      uploadPending ||
                      audience === "ONLY_ME" ||
                      (audience !== "PUBLIC" && !churchId)
                    }
                    onClick={() => void createPostDraft()}
                  >
                    {postAttempt.current
                      ? "Retry same photo draft"
                      : "Prepare post draft with saved photos"}
                  </button>
                )}
                {postDraft && (
                  <Link
                    className={portalButtonClass}
                    href={`/platform/drafts?resume=${encodeURIComponent(postDraft)}#resume`}
                  >
                    Open photo draft in composer
                  </Link>
                )}
              </section>
            )}
          </>
        )}
      </div>
      {!visible && data && (
        <button
          type="button"
          className={portalButtonClass}
          onClick={() => {
            setData(null);
            setManaged(null);
            setSaved([]);
            setUploadPending(false);
            postAttempt.current = null;
            setPostDraft(null);
            setMessage(
              "Local photo work discarded. Any already-saved photos and drafts remain on the server."
            );
          }}
        >
          Discard local photo work
        </button>
      )}
      {!visible && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={busy}
          onClick={() => void load()}
        >
          Check photos again
        </button>
      )}
      {selected && (
        <PhotoViewer
          source={source}
          accountId={ownerId}
          initialId={selected}
          pageLimit={24}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
