"use client";
import {
  usePrivatePostWorkspace,
  usePrivatePostConcealed,
  usePrivatePostRecovery
} from "./private-post-workspace";

import { Heart } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ReactionCount } from "./reaction-count";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type LikeState = { liked: boolean; version: number; count: number | null };
export function PostLikeControl({
  postId,
  owner,
  initial
}: {
  postId: string;
  owner: string;
  initial: LikeState;
}) {
  const router = useRouter();
  const privateScope = usePrivatePostWorkspace(),
    concealed = usePrivatePostConcealed();
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [refreshNeeded, setRefreshNeeded] = useState(false);
  const flight = useRef(false);
  const generation = useRef(0);
  const pendingCommand = useRef<string | null>(null);
  const lastInitial = useRef(initial);
  useLayoutEffect(() => {
    const previous = lastInitial.current;
    if (
      previous.count === initial.count &&
      previous.version === initial.version &&
      previous.liked === initial.liked
    )
      return;
    lastInitial.current = initial;
    generation.current++;
    // Fresh permitted counts must replace a retained count without dropping an
    // in-flight choice or its exact retry key.
    setState((current) =>
      pending || flight.current ? { ...current, count: initial.count } : initial
    );
  }, [initial, pending]);
  useEffect(
    () => () => {
      generation.current++;
    },
    []
  );
  const path = `/api/platform/post-likes?postId=${encodeURIComponent(postId)}`;
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Confirm your pending Like choice before leaving.")
  );
  async function send(body?: string) {
    if (
      flight.current ||
      (privateScope && privateScope.accessVersion() == null)
    )
      return;
    flight.current = true;
    const seq = generation.current;
    const access = privateScope?.accessVersion();
    const current = () =>
      seq === generation.current &&
      (!privateScope || privateScope.accessVersion() === access);
    setBusy(true);
    if (body) {
      pendingCommand.current = body;
      setPending(body);
    }
    try {
      if (body) {
        await socialRequest("/api/platform/post-likes", body, owner);
        if (!current()) return;
        pendingCommand.current = null;
        setPending(null);
      }
      const result = await socialRequest<LikeState>(path, undefined, owner);
      if (!current()) return;
      setState(result.data);
      setRefreshNeeded(false);
      setMessage(
        body
          ? result.data.liked
            ? "Post liked."
            : "Like removed."
          : "Like status checked. Choose Like or Unlike to change it."
      );
    } catch (error) {
      if (!current()) return;
      const status = error instanceof SocialClientError ? error.status : 503;
      if (!privateScope && [400, 401, 403, 404, 409, 429].includes(status)) {
        pendingCommand.current = null;
        setPending(null);
      }
      setRefreshNeeded(true);
      setMessage(
        error instanceof SocialClientError
          ? error.message
          : "The response was lost. Retry the same Like choice, or refresh its status if the change was confirmed."
      );
      if ([401, 403, 404].includes(status)) {
        if (privateScope) privateScope.refresh();
        else router.refresh();
      }
    } finally {
      flight.current = false;
      // A newer server frame may arrive between a confirmed command and its
      // refresh read. Once that stale read ends, adopt its own-state as well as
      // its redacted total. An uncertain command still keeps its original bytes.
      if (!pendingCommand.current && seq !== generation.current)
        setState(lastInitial.current);
      setBusy(false);
    }
  }
  usePrivatePostRecovery(!!pending, busy, () => {
    if (pending) void send(pending).then(() => privateScope?.refresh());
  });
  if (concealed) return null;
  return (
    <div>
      <button
        type="button"
        className="gc-post-action"
        disabled={busy || !!pending || refreshNeeded}
        aria-pressed={state.liked}
        aria-label={state.liked ? "Unlike post" : "Like post"}
        onClick={() =>
          void send(
            JSON.stringify({
              postId,
              mutationId: crypto.randomUUID(),
              expectedVersion: state.version,
              desired: !state.liked
            })
          )
        }
      >
        <Heart
          aria-hidden="true"
          className={state.liked ? "fill-current" : ""}
        />
        <span className="gc-post-action-label">
          {state.liked ? "Liked" : "Like"}
        </span>
        <ReactionCount count={initial.count === null ? null : state.count} />
      </button>
      <span role="status" className={refreshNeeded ? "text-sm" : "sr-only"}>
        {busy ? "Checking Like…" : message}
      </span>
      {!busy && pending && (
        <button
          type="button"
          className="gc-profile-text-button"
          onClick={() => void send(pending)}
        >
          Retry same Like choice
        </button>
      )}
      {!busy && refreshNeeded && !pending && (
        <button
          type="button"
          className="gc-profile-text-button"
          onClick={() => void send()}
        >
          Refresh Like status
        </button>
      )}
    </div>
  );
}
