"use client";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import type { ParticipationView } from "@/lib/platform/post-participation-reads";
import {
  PostParticipationControls,
  PrivateParticipation
} from "./post-participation-form";
import { usePrivatePostWorkspace } from "./private-post-workspace";
import { useReadVisibility } from "./read-visibility";

// The existing participation commands remain versioned state changes. This
// reader preserves the original form owners without claiming receipt replay.
export function PostParticipationClient({
  postId
}: {
  postId: string;
  manage: false;
}) {
  const scope = usePrivatePostWorkspace(),
    parentVisible = useReadVisibility();
  const originalOwner = useRef(scope?.owner).current,
    requestKey = useId();
  const latest = useRef({ scope, parentVisible });
  latest.current = { scope, parentVisible };
  const generation = useRef(0),
    work = useRef(new Map<string, boolean>());
  const snapshot = useRef<ParticipationView | null>(null);
  const [view, setView] = useState<ParticipationView | null>(null),
    [checked, setChecked] = useState(false),
    [changed, setChanged] = useState(false),
    [busy, setBusy] = useState(false),
    [working, setWorking] = useState(false),
    [message, setMessage] = useState("Checking participation…"),
    [epoch, setEpoch] = useState(0);
  const accessVersion = scope?.accessVersion() ?? null;
  const registerWork = useCallback((id: string, value: boolean, inFlight = false) => {
    if (value) work.current.set(id, inFlight);
    else work.current.delete(id);
    setWorking([...work.current.values()].some(Boolean));
    latest.current.scope?.registerWork(id, value);
  }, []);
  const read = useCallback(async () => {
    const current = latest.current.scope,
      version = current?.accessVersion();
    if (!originalOwner || current?.owner !== originalOwner || version == null)
      throw new SocialClientError(
        401,
        "Return to the original account and recheck current access."
      );
    const seq = ++generation.current;
    setBusy(true);
    setChecked(false);
    try {
      const result = await socialRequest<ParticipationView>(
        `/api/platform/participation?postId=${encodeURIComponent(postId)}`,
        undefined,
        originalOwner
      );
      const guard = () => {
        if (
          seq !== generation.current ||
          latest.current.scope?.owner !== originalOwner ||
          latest.current.scope.accessVersion() !== version
        )
          throw new SocialClientError(
            401,
            "Current participation access must be checked again."
          );
      };
      guard();
      const differs =
        !!snapshot.current &&
        JSON.stringify(snapshot.current) !== JSON.stringify(result.data);
      if (differs && work.current.size) {
        setChanged(true);
        setMessage(
          "Participation changed. Your original entries and request are retained. Recheck or discard local entries before adopting the current state."
        );
      } else {
        snapshot.current = result.data;
        setView(result.data);
        setChanged(false);
        setMessage("");
      }
      setChecked(true);
      return guard;
    } catch (error) {
      if (seq === generation.current) {
        setChecked(false);
        setMessage(
          "Participation could not be checked. Return to the original account and recheck current access. Your local entries are retained."
        );
      }
      throw error;
    } finally {
      if (seq === generation.current) setBusy(false);
    }
  }, [postId, originalOwner]);
  const refresh = useCallback(() => {
    void read().catch(() => {});
  }, [read]);
  const beforeWrite = useCallback(
    async (operation: string) => {
      if (operation !== "cancel-volunteer") return read();
      // Canceling an owned signup intentionally does not require source access.
      // Keep that existing command contract while still pinning the current owner.
      const version = latest.current.scope?.accessVersion();
      const guard = () => {
        if (
          !originalOwner ||
          version == null ||
          latest.current.scope?.owner !== originalOwner ||
          latest.current.scope.accessVersion() !== version
        )
          throw new SocialClientError(
            401,
            "Return to the original account and recheck current access."
          );
      };
      guard();
      return guard;
    },
    [originalOwner, read]
  );
  useLayoutEffect(() => {
    const counter = generation;
    if (scope?.concealed || !parentVisible || accessVersion === null) {
      generation.current++;
      setChecked(false);
      setBusy(false);
      return;
    }
    refresh();
    return () => {
      counter.current++;
    };
  }, [scope?.concealed, parentVisible, accessVersion, refresh]);
  const visible =
    !!scope && !scope.concealed && parentVisible && checked && !changed;
  return (
    <>
      {view && originalOwner && (
        <PrivateParticipation.Provider
          value={{
            owner: originalOwner,
            visible,
            beforeWrite,
            refresh,
            registerWork
          }}
        >
          <PostParticipationControls
            key={epoch}
            view={view}
            manage={false}
            requestKey={requestKey}
            defaultClose=""
          />
        </PrivateParticipation.Provider>
      )}
      {!visible && !scope?.concealed && parentVisible && (
        <div className="my-4 space-y-2">
          <p role="status">{busy ? "Checking participation…" : message}</p>
          <button
            type="button"
            className="gc-button gc-button-quiet"
            disabled={busy || working || accessVersion === null}
            onClick={refresh}
          >
            Check current participation
          </button>
          {changed && (
            <button
              type="button"
              className="gc-button gc-button-quiet"
              disabled={busy || working || accessVersion === null}
              onClick={() => {
                if ([...work.current.values()].some(Boolean)) return;
                if (
                  !window.confirm(
                    "Discard these local participation entries and check saved state? An earlier submission may already have completed. This does not undo it or submit a replacement."
                  )
                )
                  return;
                for (const id of work.current.keys())
                  latest.current.scope?.registerWork(id, false);
                work.current.clear();
                setEpoch((value) => value + 1);
                setChecked(false);
                refresh();
              }}
            >
              Discard local participation entries and reload
            </button>
          )}
        </div>
      )}
    </>
  );
}
