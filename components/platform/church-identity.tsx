"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageView } from "@/lib/platform/media";
import { socialRequest } from "@/lib/platform/social-client";
import { ProfileImage } from "./profile-image";
import { ProfileImageControl } from "./profile-image-control";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type Identity = {
  churchId: string;
  canManage: boolean;
  imagesAvailable: boolean;
  logo: ImageView | null;
  cover: ImageView | null;
};
const clean = () => ({
  avatar: { busy: false, dirty: false },
  cover: { busy: false, dirty: false }
});
export function ChurchIdentity({
  churchId,
  name
}: {
  churchId: string;
  name: string;
}) {
  const [data, setData] = useState<Identity | null>(null),
    [ownerId, setOwnerId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false),
    [editing, setEditing] = useState(false),
    [message, setMessage] = useState("Checking church photos…");
  const [work, setWork] = useState(clean);
  const generation = useRef(0),
    owner = useRef<string | null | undefined>(undefined),
    hadManagement = useRef(false);
  const onState = useCallback(
    (kind: "avatar" | "cover", state: { busy: boolean; dirty: boolean }) =>
      setWork((previous) => ({ ...previous, [kind]: state })),
    []
  );
  const pending = Object.values(work).some((item) => item.dirty || item.busy),
    saving = Object.values(work).some((item) => item.busy);
  useUnsavedSocialWork(
    { dirty: pending, saving, conflict: false },
    () =>
      setMessage(
        "Finish or discard your selected church photos before leaving."
      ),
    true
  );
  const load = useCallback(async () => {
    const turn = ++generation.current;
    try {
      const result = await socialRequest<Identity>(
        `/api/platform/church-images?churchId=${encodeURIComponent(churchId)}`
      );
      if (turn !== generation.current) return;
      const changed =
        owner.current !== undefined && owner.current !== result.owner;
      if (changed || !result.data.canManage) {
        setEditing(false);
        setWork(clean());
      }
      const revoked = hadManagement.current && !result.data.canManage;
      hadManagement.current = result.data.canManage;
      owner.current = result.owner;
      setOwnerId(result.owner);
      setData(result.data);
      setVisible(true);
      setMessage(
        changed
          ? "Your sign-in changed. Selected church photos were cleared."
          : revoked
            ? "Church photo management access changed. Selected files were cleared."
            : ""
      );
    } catch (error) {
      if (turn !== generation.current) return;
      setVisible(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Church photos are unavailable. Reconnect and check again."
      );
    }
  }, [churchId]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const hide = () => {
      generation.current++;
      setVisible(false);
    };
    const refresh = () => {
      if (document.visibilityState !== "hidden") void load();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? hide() : refresh();
    refresh();
    window.addEventListener("blur", hide);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      invalidate();
      window.removeEventListener("blur", hide);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [load, invalidate]);
  return (
    <section
      id="church-photos"
      className="space-y-4"
      aria-label="Church identity photos"
    >
      <p role="status">{message}</p>
      {data && (
        <div hidden={!visible} className="space-y-4">
          {data.cover && (
            <div className="gc-profile-cover overflow-hidden rounded-xl">
              <ProfileImage
                image={data.cover}
                name={name}
                kind="cover"
                accountId={ownerId}
                profileId={churchId}
                imageLabel="church cover"
              />
            </div>
          )}
          <ProfileImage
            image={data.logo}
            name={name}
            kind="avatar"
            accountId={ownerId}
            profileId={churchId}
            imageLabel="church logo"
          />
          {data.canManage && ownerId && (
            <>
              <button
                type="button"
                className="gc-button gc-button-quiet"
                disabled={pending}
                onClick={() => {
                  setEditing((value) => !value);
                  setWork(clean());
                }}
              >
                {editing
                  ? "Close church photo controls"
                  : "Edit church logo and cover"}
              </button>
              {editing && (
                <div
                  className="grid min-w-0 gap-6 md:grid-cols-2"
                  key={ownerId}
                >
                  {(["avatar", "cover"] as const).map((kind) => (
                    <ProfileImageControl
                      key={kind}
                      kind={kind}
                      initial={kind === "avatar" ? data.logo : data.cover}
                      userId={ownerId}
                      name={name}
                      churchId={churchId}
                      available={data.imagesAvailable}
                      disabled={saving && !work[kind].busy}
                      onState={onState}
                      onSaved={() => void load()}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                className="gc-profile-text-button"
                disabled={saving}
                onClick={() => void load()}
              >
                Check church photo permissions
              </button>
            </>
          )}
        </div>
      )}
      {!visible && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="gc-button gc-button-quiet"
            onClick={() => void load()}
          >
            Check church photos again
          </button>
          {pending && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setWork(clean());
                setMessage(
                  "Selected church photos discarded. Already-saved images are unchanged."
                );
              }}
            >
              Discard selected church photos
            </button>
          )}
        </div>
      )}
    </section>
  );
}
