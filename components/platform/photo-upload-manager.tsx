"use client";
/* eslint-disable @next/next/no-img-element -- File previews are local object URLs. */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { uploadPhotoFile } from "@/lib/platform/photo-upload-client";
import {
  currentSocialOwner,
  SocialClientError
} from "@/lib/platform/social-client";
import { portalInputClass, portalButtonClass } from "./portal-action-form";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type Entry = {
  id: string;
  file: File;
  caption: string;
  alt: string;
  state: "selected" | "uploading" | "failed" | "saved";
  invalid: boolean;
  progress: number | null;
  message: string;
  body?: string;
  image?: ImageView;
};
function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const source = URL.createObjectURL(file);
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [file]);
  return url ? (
    <img
      src={url}
      alt="Selected file preview"
      className="h-28 w-28 rounded object-contain"
      width={112}
      height={112}
      onError={(event) => {
        event.currentTarget.style.visibility = "hidden";
      }}
    />
  ) : (
    <div className="h-28 w-28" />
  );
}
export type PhotoUploadManagerOptions = {
  ownerId: string;
  targetId: string;
  purpose:
    | "POST_PHOTO"
    | "PROFILE_PHOTO"
    | "SUPPORT_ATTACHMENT"
    | "EXCHANGE_PHOTO";
  available: boolean;
  remaining: number;
  details?: Record<string, string | null>;
  onSaved: (image: ImageView) => void | Promise<void>;
  onPending?: (pending: boolean) => void;
  privacy?: { visible: boolean; onAccessDenied: () => void };
};

// The caller may keep this controller above a removable private presenter.
// Concealment never destroys selected Files or the original upload command.
export function usePhotoUploadManager(options: PhotoUploadManagerOptions) {
  const { ownerId, purpose, available, remaining, privacy, onPending } =
    options;
  const uid = useId(),
    [entries, setEntries] = useState<Entry[]>([]),
    [notice, setNotice] = useState(""),
    [checking, setChecking] = useState(false),
    [changedAccount, setChangedAccount] = useState(false);
  const work = useRef(new Map<string, ReturnType<typeof uploadPhotoFile>>()),
    generation = useRef(0),
    identityGeneration = useRef(0),
    mounted = useRef(false),
    privacyDenied = useRef(false),
    entriesRef = useRef(entries),
    current = useRef(options);
  entriesRef.current = entries;
  current.current = options;
  // A later visible render is owned by the parent's current-account check.
  // A stale event between denial and that parent's hide cannot start work.
  if (!privacy?.visible) privacyDenied.current = false;
  const canPresent = () =>
    !current.current.privacy ||
    (current.current.privacy.visible && !privacyDenied.current);
  const pending = entries.some((row) => row.state !== "saved"),
    saving = entries.some((row) => row.state === "uploading");
  useUnsavedSocialWork(
    { dirty: pending || checking, saving, conflict: false },
    () =>
      setNotice(
        "Finish or remove your selected uploads before leaving. An interrupted upload may already be saved; retry it to check."
      ),
    true
  );
  useEffect(() => {
    current.current.onPending?.(pending || checking);
  }, [onPending, pending, checking]);
  const clearAccount = useCallback(() => {
    if (!mounted.current) return;
    if (current.current.privacy) {
      privacyDenied.current = true;
      setNotice(
        "Your sign-in changed. Recheck the original account before continuing with these retained uploads."
      );
      current.current.privacy.onAccessDenied();
      return;
    }
    generation.current++;
    work.current.forEach((upload) => upload.abort());
    work.current.clear();
    setEntries([]);
    setChecking(false);
    setChangedAccount(true);
    setNotice(
      "Your sign-in changed. Pending files were cleared. Reload before adding photos."
    );
  }, []);
  useEffect(() => {
    // Supersede checks started before a concealment or an authorized return.
    // This does not cancel transport or restart its ownership effect.
    identityGeneration.current++;
  }, [privacy?.visible]);
  useEffect(() => {
    mounted.current = true;
    const uploads = work.current;
    const verify = async () => {
      if (document.visibilityState === "hidden") return;
      const seq = generation.current,
        identity = ++identityGeneration.current;
      const valid = () =>
        mounted.current &&
        current.current.ownerId === ownerId &&
        seq === generation.current &&
        identity === identityGeneration.current;
      try {
        const actor = await currentSocialOwner();
        if (valid() && actor !== ownerId) clearAccount();
      } catch {
        if (valid())
          setNotice(
            "Reconnect to confirm your account before uploading. Your selections remain here."
          );
      }
    };
    window.addEventListener("focus", verify);
    window.addEventListener("online", verify);
    const invalidate = () => {
      mounted.current = false;
      generation.current++;
      identityGeneration.current++;
    };
    return () => {
      invalidate();
      uploads.forEach((upload) => upload.abort());
      uploads.clear();
      window.removeEventListener("focus", verify);
      window.removeEventListener("online", verify);
    };
  }, [ownerId, clearAccount]);
  const update = (id: string, patch: Partial<Entry>) =>
    setEntries((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  async function select(files: FileList | null) {
    if (!files || changedAccount || !mounted.current || !canPresent()) return;
    const { remaining, purpose, ownerId } = current.current;
    const room = Math.min(
      10,
      Math.max(
        0,
        remaining -
          entriesRef.current.filter((row) => row.state !== "saved").length
      )
    );
    if (files.length > room) {
      setNotice(
        purpose === "SUPPORT_ATTACHMENT"
          ? `Choose at most ${room} more images. Each feedback receipt holds up to three.`
          : purpose === "EXCHANGE_PHOTO"
            ? `Choose at most ${room} more photos. Each listing holds up to eight.`
            : `Choose at most ${room} more photos in this batch. Each post holds up to ten photos; a profile library holds up to 1,000.`
      );
      return;
    }
    const seq = generation.current;
    setChecking(true);
    setNotice("");
    try {
      const selected = await Promise.all(
        Array.from(files).map(async (file) => {
          let invalid = !file.size || file.size > 4 * 1024 * 1024;
          if (!invalid) {
            const header = new Uint8Array(
              await file.slice(0, 12).arrayBuffer()
            );
            const jpeg =
              header[0] === 255 && header[1] === 216 && header[2] === 255;
            const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
              (value, index) => header[index] === value
            );
            const webp =
              String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...header.slice(8, 12)) === "WEBP";
            invalid = !jpeg && !png && !webp;
          }
          return {
            id: crypto.randomUUID(),
            file,
            caption: "",
            alt: "",
            state: "selected" as const,
            progress: null,
            invalid,
            message: invalid
              ? "Choose a still JPEG, PNG or WebP no larger than 4 MiB. Other selected files are unchanged."
              : "Ready to save."
          };
        })
      );
      if (
        mounted.current &&
        current.current.ownerId === ownerId &&
        seq === generation.current
      )
        setEntries((rows) => [...rows, ...selected]);
    } finally {
      if (mounted.current && seq === generation.current) setChecking(false);
    }
  }
  async function save(id: string) {
    const {
      ownerId,
      purpose,
      targetId,
      available,
      details = {}
    } = current.current;
    const row = entriesRef.current.find((entry) => entry.id === id);
    if (
      !mounted.current ||
      !canPresent() ||
      !row ||
      row.invalid ||
      row.state === "saved" ||
      work.current.has(id) ||
      !available ||
      changedAccount
    )
      return;
    const body =
      row.body ??
      JSON.stringify({
        purpose,
        targetId,
        ...details,
        caption: row.caption,
        alt: row.alt,
        requestKey: crypto.randomUUID()
      });
    const seq = generation.current;
    const valid = () =>
      mounted.current &&
      current.current.ownerId === ownerId &&
      seq === generation.current;
    update(id, {
      body,
      state: "uploading",
      progress: null,
      message: "Checking your account and uploading…"
    });
    const task = uploadPhotoFile(row.file, body, ownerId, (percent) => {
      if (valid())
        update(id, {
          progress: percent,
          message: percent === 100 ? "Processing and saving…" : "Uploading…"
        });
    });
    work.current.set(id, task);
    try {
      const image = await task.promise;
      if (!valid()) return;
      update(id, {
        image,
        state: "saved",
        progress: 100,
        message: "Photo saved."
      });
      try {
        await current.current.onSaved(image);
        if (valid() && purpose === "SUPPORT_ATTACHMENT")
          setEntries((rows) => rows.filter((entry) => entry.id !== id));
      } catch {
        if (valid())
          setNotice(
            "The photo was saved. Refresh the collection to check its latest position."
          );
      }
    } catch (error) {
      if (!valid()) return;
      const accountDenied =
        error instanceof SocialClientError &&
        (current.current.privacy
          ? [401, 403, 404].includes(error.status)
          : error.status === 401);
      if (accountDenied && !current.current.privacy) {
        clearAccount();
        return;
      }
      update(id, {
        state: "failed",
        progress: null,
        message:
          error instanceof Error
            ? error.message
            : "Save was not confirmed. Retry the same file."
      });
      // Retain the exact file and details, but make an interrupted private
      // request retryable after the original account has been checked again.
      if (accountDenied) clearAccount();
    } finally {
      if (work.current.get(id) === task) work.current.delete(id);
    }
  }
  function edit(id: string, patch: Pick<Partial<Entry>, "caption" | "alt">) {
    const row = entriesRef.current.find((entry) => entry.id === id);
    if (
      !mounted.current ||
      !canPresent() ||
      changedAccount ||
      !row ||
      row.body ||
      row.invalid
    )
      return;
    update(id, patch);
  }
  function remove(id: string) {
    if (
      !mounted.current ||
      !canPresent() ||
      entriesRef.current.find((row) => row.id === id)?.state === "uploading"
    )
      return;
    setEntries((rows) => rows.filter((entry) => entry.id !== id));
  }
  function stop(id: string) {
    if (mounted.current && canPresent()) work.current.get(id)?.abort();
  }
  function saveAll() {
    for (const row of entriesRef.current)
      if (!row.invalid && row.state !== "saved") void save(row.id);
  }
  return {
    uid,
    entries,
    notice,
    checking,
    changedAccount,
    pending: pending || checking,
    saving,
    purpose,
    available,
    remaining,
    visible: canPresent(),
    select,
    save,
    saveAll,
    edit,
    remove,
    stop
  };
}

export type PhotoUploadManagerController = ReturnType<
  typeof usePhotoUploadManager
>;

export function PhotoUploadManager(options: PhotoUploadManagerOptions) {
  const controller = usePhotoUploadManager(options);
  return <PhotoUploadManagerView controller={controller} />;
}

export function PhotoUploadManagerView({
  controller
}: {
  controller: PhotoUploadManagerController;
}) {
  const {
    uid,
    entries,
    notice,
    checking,
    changedAccount,
    saving,
    purpose,
    available,
    remaining,
    select,
    save,
    saveAll,
    edit,
    remove,
    stop,
    visible
  } = controller;
  if (!visible) return null;
  return (
    <section
      aria-labelledby={`${uid}-title`}
      className="space-y-4 rounded-xl border border-gc-divider p-4"
    >
      <h3 id={`${uid}-title`} className="text-xl">
        {purpose === "SUPPORT_ATTACHMENT"
          ? "Optional private attachments"
          : "Add photos"}
      </h3>
      <p className="text-sm text-gc-muted">
        {purpose === "SUPPORT_ATTACHMENT"
          ? "Choose up to three still JPEG, PNG or WebP images, each up to 4 MiB. Review and remove private details before uploading. Uploaded images join the private receipt only when you send feedback; unsent uploads expire after 24 hours."
          : purpose === "EXCHANGE_PHOTO"
            ? "Choose up to eight still JPEG, PNG or WebP listing photos, each up to 4 MiB. Keep private contact details and exact pickup addresses out of photos. Captions and image descriptions are optional."
            : "Select up to ten still JPEG, PNG or WebP files per batch, each up to 4 MiB. Captions and image descriptions are optional. Saved files stay saved if another file fails."}
      </p>
      {!available && (
        <p role="status">
          Photo uploads are currently unavailable. Your existing photos remain
          unchanged.
        </p>
      )}
      <label className="block font-semibold" htmlFor={`${uid}-files`}>
        Choose photos
      </label>
      <input
        id={`${uid}-files`}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        disabled={!available || changedAccount || checking || remaining <= 0}
        className="block max-w-full"
        onChange={(event) => {
          void select(event.target.files);
          event.target.value = "";
        }}
      />
      {entries.length > 1 && (
        <button
          type="button"
          className={portalButtonClass}
          disabled={
            !available ||
            changedAccount ||
            saving ||
            checking ||
            !entries.some((row) => !row.invalid && row.state !== "saved")
          }
          onClick={saveAll}
        >
          {purpose === "SUPPORT_ATTACHMENT"
            ? "Upload selected attachments"
            : "Save selected photos"}
        </button>
      )}
      <p role="status">
        {notice || (checking ? "Checking selected files…" : "")}
      </p>
      <ul className="space-y-4">
        {entries.map((row) => (
          <li
            key={row.id}
            className="space-y-3 rounded-lg border border-gc-divider p-3"
            aria-label={`Upload ${row.file.name}`}
          >
            <div className="flex flex-wrap gap-3">
              <FilePreview file={row.file} />
              <div className="min-w-0">
                <p className="break-all font-semibold">{row.file.name}</p>
                <p className="text-sm">{Math.ceil(row.file.size / 1024)} KiB</p>
              </div>
            </div>
            <fieldset
              disabled={!!row.body || row.invalid || changedAccount}
              className="min-w-0 space-y-2"
            >
              <label htmlFor={`${row.id}-caption`} className="block">
                Caption
              </label>
              <textarea
                id={`${row.id}-caption`}
                className={portalInputClass}
                rows={2}
                maxLength={500}
                value={row.caption}
                onChange={(event) =>
                  edit(row.id, { caption: event.target.value })
                }
              />
              <label htmlFor={`${row.id}-alt`} className="block">
                Image description for screen readers
              </label>
              <input
                id={`${row.id}-alt`}
                className={portalInputClass}
                maxLength={300}
                value={row.alt}
                onChange={(event) => edit(row.id, { alt: event.target.value })}
              />
            </fieldset>
            {row.state === "uploading" && (
              <progress
                className="w-full"
                aria-label={`Upload progress for ${row.file.name}`}
                max={100}
                value={row.progress ?? undefined}
              />
            )}
            <p role="status">{row.message}</p>
            {!!row.body && row.state !== "saved" && (
              <p className="text-sm text-gc-muted">
                Retry keeps this file, caption, description and original sharing
                choice unchanged. Removing it here does not delete a photo that
                already reached the server.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {row.state !== "saved" && (
                <button
                  type="button"
                  className={portalButtonClass}
                  disabled={
                    row.invalid ||
                    row.state === "uploading" ||
                    changedAccount ||
                    !available
                  }
                  onClick={() => void save(row.id)}
                >
                  {row.body
                    ? "Retry same upload"
                    : purpose === "SUPPORT_ATTACHMENT"
                      ? "Upload private attachment"
                      : "Save photo"}
                </button>
              )}
              {row.state === "uploading" ? (
                <button
                  type="button"
                  className={portalButtonClass}
                  onClick={() => stop(row.id)}
                >
                  Stop upload
                </button>
              ) : (
                <button
                  type="button"
                  className={portalButtonClass}
                  onClick={() => remove(row.id)}
                >
                  {row.state === "saved"
                    ? "Clear saved receipt"
                    : "Remove selected file"}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
