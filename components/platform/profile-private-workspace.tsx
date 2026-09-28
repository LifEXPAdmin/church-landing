"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProfileEditorView } from "@/lib/platform/profiles";
import { socialRequest } from "@/lib/platform/social-client";
import { ProfileEditor } from "./profile-editor";
import { ReadVisibility, useReadVisibility } from "./read-visibility";

// Load private fields only after the account boundary confirms the current owner.
// Once mounted, the editor owns its draft; a focus check must not replace it.
export function ProfilePrivateWorkspace({
  owner,
  focus
}: {
  owner: string;
  focus?: "appearance" | "sections";
}) {
  const initialOwner = useRef(owner).current;
  const sourceVisible = useReadVisibility();
  const visible = sourceVisible && owner === initialOwner;
  const [profile, setProfile] = useState<ProfileEditorView | null>(null);
  const [notice, setNotice] = useState("Checking your saved profile…");
  const [pending, setPending] = useState(false);
  const [suspended, setSuspended] = useState(true);
  const generation = useRef(0),
    active = useRef(false),
    reading = useRef(false),
    queued = useRef(false),
    snapshot = useRef<ProfileEditorView | null>(null);
  const latestRead = useRef<() => Promise<void>>(async () => {});
  const read = useCallback(async () => {
    if (!active.current || snapshot.current) return;
    if (reading.current) {
      queued.current = true;
      return;
    }
    reading.current = true;
    setPending(true);
    setNotice("Checking your saved profile…");
    const seq = ++generation.current;
    try {
      const { data } = await socialRequest<ProfileEditorView>(
        "/api/platform/profile",
        undefined,
        initialOwner
      );
      if (seq !== generation.current || !active.current) return;
      if (data.id !== initialOwner)
        throw Error("Your sign-in changed. Reload before continuing.");
      snapshot.current = data;
      setProfile(data);
      setNotice("");
    } catch (error) {
      if (seq === generation.current && active.current)
        setNotice(
          error instanceof Error
            ? error.message
            : "Your saved profile could not be checked. Try again."
        );
    } finally {
      reading.current = false;
      setPending(false);
      if (queued.current && active.current) {
        queued.current = false;
        void latestRead.current();
      }
    }
  }, [initialOwner]);
  latestRead.current = read;
  useEffect(() => {
    const hide = () => {
      active.current = false;
      setSuspended(true);
      queued.current = false;
      generation.current++;
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    active.current = visible;
    if (visible) {
      setSuspended(false);
      void read();
    } else hide();
    window.addEventListener("blur", hide);
    window.addEventListener("pagehide", hide);
    window.addEventListener("offline", hide);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      hide();
      window.removeEventListener("blur", hide);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("offline", hide);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [visible, read]);
  return profile ? (
    <>
      {sourceVisible && owner !== initialOwner && (
        <p role="status">
          This editor belongs to the account that opened it. Return to that
          account to continue your draft, or reload to open the current profile.
        </p>
      )}
      <ReadVisibility.Provider value={visible && !suspended}>
        <ProfileEditor profile={profile} focus={focus} />
      </ReadVisibility.Provider>
    </>
  ) : visible ? (
    <section aria-busy={pending} className="space-y-3">
      <h1 className="text-3xl">Edit your profile</h1>
      <p role="status">{notice}</p>
      <button
        type="button"
        className="gc-button gc-button-quiet"
        disabled={pending}
        onClick={() => void read()}
      >
        Check saved profile again
      </button>
    </section>
  ) : null;
}
