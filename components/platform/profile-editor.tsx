"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePhotoBackGuard } from "./use-photo-back-guard";
import { ProfileForm } from "./profile-form";
import { ProfileImageControl } from "./profile-image-control";
import type { ProfileEditorView } from "@/lib/platform/profiles";

export function ProfileEditor({ profile }: { profile: ProfileEditorView }) {
  const [images, setImages] = useState({
    avatar: { busy: false, dirty: false },
    cover: { busy: false, dirty: false }
  });
  const [backNotice, setBackNotice] = useState("");
  const [textDirty, setTextDirty] = useState(false),
    [textBusy, setTextBusy] = useState(false),
    [leave, setLeave] = useState<string | null>(null);
  const allowLeave = useRef(false),
    dirty = useRef(false),
    dialog = useRef<HTMLDialogElement>(null);
  const onImageState = useCallback(
    (kind: "avatar" | "cover", state: { busy: boolean; dirty: boolean }) =>
      setImages((previous) => ({ ...previous, [kind]: state })),
    []
  );
  const selectedPhoto = Object.values(images).some(
    (image) => image.busy || image.dirty
  );
  dirty.current = textDirty || textBusy || selectedPhoto;
  const releaseForNavigation = usePhotoBackGuard(dirty.current, () =>
    setBackNotice(
      "Your unsaved profile changes are still here. Finish or discard them before leaving."
    )
  );
  useEffect(() => {
    const before = (event: BeforeUnloadEvent) => {
      if (dirty.current && !allowLeave.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const follow = (event: MouseEvent) => {
      if (
        !dirty.current ||
        allowLeave.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
        "a[href]"
      );
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const url = new URL(link.href, window.location.href);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        (url.pathname === location.pathname &&
          url.search === location.search &&
          url.hash)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeave(url.href);
    };
    window.addEventListener("beforeunload", before);
    document.addEventListener("click", follow, true);
    return () => {
      window.removeEventListener("beforeunload", before);
      document.removeEventListener("click", follow, true);
    };
  }, []);
  useEffect(() => {
    if (leave) dialog.current?.showModal();
    else dialog.current?.close();
  }, [leave]);
  return (
    <div className="gc-profile-editor space-y-6">
      <Link
        className="gc-profile-text-button"
        href="/platform/settings/profile"
      >
        Back to Profile settings
      </Link>
      <p role="status">{backNotice}</p>
      <header>
        <h1 className="text-4xl sm:text-5xl">Edit your profile</h1>
        <p className="mt-3 max-w-3xl text-gc-muted">
          Share what you want other members to see. Your name and username
          identify public posts and comments. Profile details and photos require
          sign-in; your account email and church directory choices stay
          separate.
        </p>
      </header>
      <section aria-labelledby="profile-photos-heading" className="space-y-4">
        <h2 id="profile-photos-heading" className="text-2xl">
          Profile photos (optional)
        </h2>
        <p className="text-sm text-gc-muted">
          Profile pictures and covers are visible to permitted signed-in
          members. Each photo saves separately. Your unsaved text stays here
          while you edit a photo.
        </p>
        {profile.photoLibraryEnabled && (
          <a
            className="gc-profile-text-button"
            href={`/platform/profile/${encodeURIComponent(profile.username)}?tab=photos`}
          >
            Manage your Photos, profile pictures and covers
          </a>
        )}
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {(["avatar", "cover"] as const).map((kind) => (
            <ProfileImageControl
              key={kind}
              initial={profile[kind]}
              userId={profile.id}
              name={profile.name}
              kind={kind}
              available={profile.imagesAvailable}
              retainsHistory={profile.photoLibraryEnabled}
              disabled={textBusy}
              onState={onImageState}
            />
          ))}
        </div>
      </section>
      <ProfileForm
        profile={profile}
        imagesPending={selectedPhoto}
        onDirty={setTextDirty}
        onBusy={setTextBusy}
        onSaved={() => {
          allowLeave.current = true;
          releaseForNavigation();
        }}
      />
      <section
        aria-labelledby="profile-contact-heading"
        className="gc-settings space-y-4"
      >
        <h2 id="profile-contact-heading" className="text-2xl">
          Optional contact details
        </h2>
        <p>
          Your member profile has no phone or contact-email field. You can
          choose a separate email and phone for your church directory, or leave
          both empty. Directory sharing does not change your private sign-in
          email.
        </p>
        <p>
          Directory participation is optional. Each contact starts with Only me;
          sharing requires a current approved church connection and verified
          adult eligibility. Street-address sharing is unavailable.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            className="gc-profile-text-button"
            href="/platform/my-church/sharing"
          >
            Review church directory contacts
          </Link>
          <Link
            className="gc-profile-text-button"
            href="/platform/settings/account/email"
          >
            Manage private sign-in email
          </Link>
        </div>
      </section>
      <dialog
        ref={dialog}
        className="gc-profile-leave-dialog"
        aria-labelledby="profile-leave-title"
        onCancel={(event) => {
          event.preventDefault();
          setLeave(null);
        }}
      >
        <h2 id="profile-leave-title" className="text-2xl">
          Keep your unsaved changes?
        </h2>
        <p className="my-4">
          You have edits or a selected photo that may not be saved. Stay here to
          finish or discard them before leaving.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="gc-profile-text-button"
            onClick={() => setLeave(null)}
            autoFocus
          >
            Keep editing
          </button>
          <button
            type="button"
            className="gc-profile-text-button"
            onClick={() => {
              if (leave) {
                allowLeave.current = true;
                releaseForNavigation();
                window.location.assign(leave);
              }
            }}
          >
            Discard unsaved changes and leave
          </button>
        </div>
      </dialog>
    </div>
  );
}
