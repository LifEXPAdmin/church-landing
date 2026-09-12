"use client";
import { Heart } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { socialRequest, SocialClientError } from "@/lib/platform/social-client";
import { useUnsavedSocialWork } from "./use-unsaved-social-work";

type LikeState = { liked: boolean; version: number; count: number };
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
  const [state, setState] = useState(initial),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [refreshNeeded, setRefreshNeeded] = useState(false);
  const flight = useRef(false);
  const path = `/api/platform/post-likes?postId=${encodeURIComponent(postId)}`;
  useUnsavedSocialWork(
    { dirty: false, saving: !!pending, conflict: false },
    () => setMessage("Confirm your pending Like choice before leaving.")
  );
  async function send(body?: string) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    if (body) setPending(body);
    try {
      if (body) {
        await socialRequest("/api/platform/post-likes", body, owner);
        setPending(null);
      }
      const result = await socialRequest<LikeState>(path, undefined, owner);
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
      const status = error instanceof SocialClientError ? error.status : 503;
      if ([400, 401, 403, 404, 409, 429].includes(status)) setPending(null);
      setRefreshNeeded(true);
      setMessage(
        error instanceof SocialClientError
          ? error.message
          : "The response was lost. Retry the same Like choice, or refresh its status if the change was confirmed."
      );
      if ([401, 403, 404].includes(status)) router.refresh();
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
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
        <span>{state.count}</span>
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
