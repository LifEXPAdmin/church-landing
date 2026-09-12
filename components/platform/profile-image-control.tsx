"use client";
/* eslint-disable @next/next/no-img-element -- Local crop previews and authorized images cannot use the shared optimizer. */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { accountInputClass } from "./account-form";
import { ProfileImage } from "./profile-image";
import type { ImageView } from "@/lib/platform/media";
import {
  centeredCrop,
  imageCropRect,
  type ImageCrop
} from "@/lib/platform/image-crop";

type State = { busy: boolean; dirty: boolean };
export function ProfileImageControl({
  initial,
  userId,
  name,
  kind,
  available,
  disabled,
  onState
}: {
  initial: ImageView | null;
  userId: string;
  name: string;
  kind: "avatar" | "cover";
  available: boolean;
  disabled: boolean;
  onState: (kind: "avatar" | "cover", state: State) => void;
}) {
  const [saved, setSaved] = useState(initial),
    [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState(""),
    [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [crop, setCrop] = useState<ImageCrop>(centeredCrop),
    [alt, setAlt] = useState("");
  const [busy, setBusy] = useState(false),
    [preparing, setPreparing] = useState(false),
    [progress, setProgress] = useState<number | null>(null),
    [message, setMessage] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(false),
    [conflict, setConflict] = useState(false);
  const request = useRef<XMLHttpRequest | null>(null),
    lock = useRef(false),
    input = useRef<HTMLInputElement>(null);
  const attempt = useRef<{ file: File; signature: string; key: string } | null>(
    null
  );
  const feedback = useRef<HTMLParagraphElement>(null),
    generation = useRef(0);
  const title = kind === "avatar" ? "Avatar" : "Cover photo",
    purpose = kind === "avatar" ? "PROFILE_AVATAR" : "PROFILE_COVER";
  const aspect = kind === "avatar" ? 1 : 3;
  useEffect(() => {
    if (!file) {
      setSource("");
      return;
    }
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    onState(kind, { busy: busy || preparing, dirty: !!file });
  }, [busy, preparing, file, kind, onState]);
  useEffect(
    () => () => {
      generation.current++;
      if (request.current) {
        request.current.onload =
          request.current.onerror =
          request.current.ontimeout =
          request.current.onabort =
            null;
        request.current.upload.onprogress = null;
        request.current.abort();
      }
    },
    []
  );
  const reset = () => {
    generation.current++;
    setFile(null);
    setDimensions({ width: 0, height: 0 });
    attempt.current = null;
    if (input.current) input.current.value = "";
  };
  async function choose(
    selected: File,
    framing = centeredCrop,
    description = ""
  ) {
    const turn = ++generation.current;
    setMessage("");
    setConflict(false);
    if (selected.size > 4 * 1024 * 1024 || !selected.size) {
      setMessage("Choose a JPEG, PNG or WebP no larger than 4 MiB.");
      return;
    }
    setPreparing(true);
    try {
      const bytes = new Uint8Array(await selected.slice(0, 12).arrayBuffer());
      const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
        (b, i) => bytes[i] === b
      );
      const webp =
        String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
        String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
      if (turn !== generation.current) return;
      if (!jpeg && !png && !webp) {
        setMessage(
          "This file is not a JPEG, PNG or WebP image. Your saved photo is unchanged."
        );
        return;
      }
      setFile(selected);
      setCrop(framing);
      setAlt(description);
      setDimensions({ width: 0, height: 0 });
      attempt.current = null;
    } finally {
      if (turn === generation.current) setPreparing(false);
    }
  }
  async function adjust() {
    if (!saved || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("Loading your original photo…");
    try {
      const response = await fetch(saved.variants.original.url, {
        cache: "no-store"
      });
      if (!response.ok)
        throw new Error("Your photo could not be loaded. Try again.");
      await choose(
        new File([await response.blob()], "profile.webp", {
          type: "image/webp"
        }),
        saved.crop ?? centeredCrop,
        saved.alt
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Your photo could not be loaded."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function upload() {
    if (!file || lock.current || preparing || disabled || !dimensions.width)
      return;
    lock.current = true;
    setBusy(true);
    setProgress(null);
    setMessage("Uploading photo…");
    setConflict(false);
    const details = {
      purpose,
      targetId: userId,
      replacesId: saved?.id,
      alt,
      crop
    };
    const signature = JSON.stringify(details);
    if (
      !attempt.current ||
      attempt.current.file !== file ||
      attempt.current.signature !== signature
    )
      attempt.current = { file, signature, key: crypto.randomUUID() };
    const xhr = new XMLHttpRequest();
    request.current = xhr;
    xhr.open("POST", "/api/platform/images");
    xhr.timeout = 60_000;
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader(
      "X-Image-Details",
      encodeURIComponent(
        JSON.stringify({ ...details, requestKey: attempt.current.key })
      )
    );
    xhr.upload.onprogress = (event) => {
      const percent = event.lengthComputable
        ? Math.floor((event.loaded / event.total) * 100)
        : null;
      setProgress(percent);
      setMessage(
        percent === 100 ? "Processing and saving photo…" : "Uploading photo…"
      );
    };
    const finish = () => {
      request.current = null;
      lock.current = false;
      setBusy(false);
      setProgress(null);
      requestAnimationFrame(() => feedback.current?.focus());
    };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (
          xhr.status >= 200 &&
          xhr.status < 300 &&
          result.id &&
          result.variants
        ) {
          setSaved(result);
          reset();
          setMessage(`${title} saved.`);
          setRemoveConfirm(false);
        } else {
          setMessage(
            result.message ??
              "Your photo was not confirmed. Retry to check the same upload."
          );
          setConflict(xhr.status === 409);
        }
      } catch {
        setMessage(
          "The save was not confirmed. Retry to check the same upload."
        );
      }
      finish();
    };
    xhr.onerror = xhr.ontimeout = () => {
      setMessage(
        "The connection stopped before the save was confirmed. Your selected photo and crop are still here. Retry the same upload."
      );
      finish();
    };
    xhr.onabort = () => {
      setMessage(
        "Upload stopped. Your selected photo and crop are still here. Retry to check whether it was saved."
      );
      finish();
    };
    try {
      xhr.send(file);
    } catch {
      setMessage(
        "The upload could not start. Your selected photo and crop are still here. Try again."
      );
      finish();
    }
  }
  async function remove() {
    if (!saved || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/platform/images", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: saved.id, expectedVersion: saved.version })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.message ?? "Removal was not confirmed. Try again.");
        setConflict(response.status === 409);
        return;
      }
      setSaved(null);
      setRemoveConfirm(false);
      setMessage(`${title} removed.`);
    } catch {
      setMessage("Removal was not confirmed. Try again to check the result.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function reviewLatest() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/platform/profile", {
        cache: "no-store"
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message ?? "The saved photo could not be loaded."
        );
      setSaved(result[kind]);
      attempt.current = null;
      setConflict(false);
      setMessage(
        "The saved photo is shown below. Your selected photo and crop are retained. Save only if you want to replace that version."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The saved photo could not be loaded."
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const rect = dimensions.width
    ? imageCropRect(dimensions.width, dimensions.height, aspect, crop)
    : null;
  return (
    <section
      className="gc-profile-image-control"
      aria-labelledby={`${kind}-heading`}
      aria-busy={busy || preparing}
    >
      <h2 id={`${kind}-heading`} className="text-2xl">
        {kind === "avatar" ? "Profile photo" : title}
      </h2>
      <p className="text-sm text-gc-muted">
        Visible to signed-in members. JPEG, PNG or WebP, up to 4 MiB.
      </p>
      <div className="gc-profile-saved-photo">
        <ProfileImage
          image={saved}
          name={name}
          kind={kind}
          accountId={userId}
          profileId={userId}
        />
      </div>
      {!available && (
        <p className="text-sm text-gc-muted">
          Photo uploads are not available yet. You can still edit your profile.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {available && (
          <label className="gc-profile-file-label">
            Choose {kind === "avatar" ? "avatar" : "cover"}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={disabled || busy || preparing}
              onChange={(e) => {
                const selected = e.currentTarget.files?.[0];
                if (selected)
                  void choose(selected).catch(() =>
                    setMessage(
                      "This file could not be opened. Choose it again."
                    )
                  );
              }}
            />
          </label>
        )}
        {saved && available && !file && (
          <button
            type="button"
            className="gc-profile-text-button"
            disabled={disabled || busy}
            onClick={() => void adjust()}
          >
            Adjust {kind} crop
          </button>
        )}
        {saved && !file && (
          <button
            type="button"
            className="gc-profile-text-button"
            disabled={disabled || busy}
            onClick={() => setRemoveConfirm(true)}
          >
            Remove {kind}
          </button>
        )}
      </div>
      {removeConfirm && (
        <div className="gc-profile-confirm">
          <p>Remove this {kind}? You can choose another photo later.</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="gc-profile-text-button"
              disabled={busy || disabled}
              onClick={() => void remove()}
            >
              Confirm remove {kind}
            </button>
            <button
              type="button"
              className="gc-profile-text-button"
              disabled={busy}
              onClick={() => setRemoveConfirm(false)}
            >
              Keep photo
            </button>
          </div>
        </div>
      )}
      {file && (
        <div className="space-y-4">
          <p className="break-words text-sm">Selected: {file.name}</p>
          <div
            className={`gc-image-crop-preview gc-image-crop-${kind}`}
            style={{ aspectRatio: aspect }}
            aria-label={`${title} crop preview`}
          >
            {source && (
              <img
                key={source}
                src={source}
                alt="Selected photo crop preview"
                draggable={false}
                onLoad={(e) =>
                  setDimensions({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight
                  })
                }
                onError={() => {
                  setMessage(
                    "This image could not be opened. Choose a different JPEG, PNG or WebP."
                  );
                  setDimensions({ width: 0, height: 0 });
                }}
                style={
                  rect
                    ? {
                        position: "absolute",
                        maxWidth: "none",
                        width: `${(dimensions.width / rect.width) * 100}%`,
                        height: `${(dimensions.height / rect.height) * 100}%`,
                        left: `${(-rect.left / rect.width) * 100}%`,
                        top: `${(-rect.top / rect.height) * 100}%`
                      }
                    : { width: "100%" }
                }
              />
            )}
          </div>
          <p className="text-sm text-gc-muted">
            Use the sliders to zoom and position your photo. The preview shows
            the saved crop.
          </p>
          {(
            [
              ["zoom", "Zoom", 1, 4, 0.05],
              ["x", "Horizontal position", 0, 1, 0.01],
              ["y", "Vertical position", 0, 1, 0.01]
            ] as const
          ).map(([key, label, min, max, step]) => (
            <label
              key={key}
              className="block text-sm"
              htmlFor={`${kind}-${key}`}
            >
              {label}
              {key === "zoom" ? `: ${crop.zoom.toFixed(2)}×` : ""}
              <input
                id={`${kind}-${key}`}
                type="range"
                className="gc-profile-range"
                min={min}
                max={max}
                step={step}
                value={crop[key]}
                disabled={disabled || busy}
                onChange={(e) =>
                  setCrop((previous) => ({
                    ...previous,
                    [key]: Number(e.target.value)
                  }))
                }
              />
            </label>
          ))}
          <label className="block" htmlFor={`${kind}-alt`}>
            Photo description (optional)
            <input
              id={`${kind}-alt`}
              className={accountInputClass}
              value={alt}
              maxLength={300}
              disabled={disabled || busy}
              onChange={(e) => setAlt(e.target.value)}
            />
          </label>
          <p className="text-sm text-gc-muted">
            A short description helps people using a screen reader. Up to 300
            characters.
          </p>
          {busy && (
            <progress
              className="w-full"
              max={100}
              value={progress ?? undefined}
              aria-label={`${title} upload progress`}
            />
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={disabled || busy || !dimensions.width}
              onClick={upload}
            >
              Save {kind}
            </Button>
            {!busy && (
              <button
                type="button"
                className="gc-profile-text-button"
                disabled={disabled}
                onClick={() => {
                  reset();
                  setMessage(
                    "Selected photo discarded. Your saved photo is unchanged."
                  );
                }}
              >
                Discard selected photo
              </button>
            )}
            {busy && request.current && (
              <button
                type="button"
                className="gc-profile-text-button"
                onClick={() => request.current?.abort()}
              >
                Stop upload
              </button>
            )}
          </div>
        </div>
      )}
      <p
        ref={feedback}
        tabIndex={-1}
        role="status"
        className="break-words text-sm"
      >
        {message}
      </p>
      {conflict && (
        <button
          type="button"
          className="gc-profile-text-button"
          disabled={disabled || busy}
          onClick={() => void reviewLatest()}
        >
          Review latest saved {kind}
        </button>
      )}
    </section>
  );
}
