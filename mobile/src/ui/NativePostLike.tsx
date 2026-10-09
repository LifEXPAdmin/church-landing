import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import type { createNativeRuntime } from "../session/runtime";
import type { PostLikeProblem, PostLikeSnapshot } from "../interactions/post-like-controller";
import { Button, Text } from "./primitives";

type Runtime = ReturnType<typeof createNativeRuntime>;
const messages: Record<PostLikeProblem, string> = {
  unavailable: "Like status could not be checked. Try again when your connection is available.",
  "feature-unavailable": "Likes are currently unavailable in the app.",
  "not-found": "Likes are unavailable for this post or your access has changed.",
  "refresh-required": "This post has changed. Check its Like status before choosing again.",
  "recovery-required": "Your account needs attention on the website before you can continue.",
  "update-required": "Update the app before using Likes.",
  "rate-limited": "Please wait before trying again.",
  unconfirmed: "Your Like choice could not be confirmed. Retry the same choice to check its outcome."
};

function useLikeAction(runtime: Runtime, state: PostLikeSnapshot) {
  const mounted = useRef<Runtime | null>(null), flight = useRef<object | null>(null);
  useLayoutEffect(() => {
    mounted.current = runtime; flight.current = null;
    return () => { if (mounted.current === runtime) mounted.current = null; };
  }, [runtime]);
  return (command: () => Promise<unknown>) => {
    if (mounted.current !== runtime || flight.current || runtime.likes.getSnapshot() !== state) return;
    const operation = {}; flight.current = operation;
    void runtime.recordForegroundActivity();
    void command().finally(() => { if (flight.current === operation) flight.current = null; });
  };
}

/** Commands carry the exact rendered snapshot. Neither the UI nor an old
 * retained handler can choose the owner, version, mutation ID or retry body. */
export function NativePostLike({ runtime, postId }: { runtime: Runtime; postId: string }) {
  const state = useSyncExternalStore(runtime.likes.subscribe, runtime.likes.getSnapshot);
  const matches = state.currentPostId === postId && state.phase !== "concealed";
  const message = matches ? state.problem ? messages[state.problem] :
    state.phase === "saving" ? "Saving your Like choice..." :
    state.phase === "loading" ? "Checking Like status..." : null : null;
  useEffect(() => {
    if (Platform.OS === "ios" && message && runtime.session.getSnapshot().foreground &&
      runtime.likes.getSnapshot() === state) AccessibilityInfo.announceForAccessibility(message);
  }, [runtime, state, message]);
  const act = useLikeAction(runtime, state);
  if (!matches) return null;
  return <>
    {state.phase === "unconfirmed" && state.problem !== "unconfirmed" ?
      <Text>Your earlier Like choice is still unconfirmed. Check availability before retrying that same choice.</Text> : null}
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {state.liked !== null ? <>
      <Text variant="small" tone="muted">{state.count === null ? "Like count hidden" :
        `${state.count} ${state.count === 1 ? "like" : "likes"}`}</Text>
      <Button label={state.liked ? "Unlike" : "Like"} secondary selected={state.liked} disabled={!state.canChoose}
        onPress={() => act(() => runtime.setLike(state, !state.liked))} />
    </> : null}
    {state.problem === "rate-limited" && state.retryAfterSeconds !== null ?
      <Text variant="small" tone="muted">The server requested a pause of {state.retryAfterSeconds} seconds.</Text> : null}
    {state.canRetry ? <Button label="Retry same Like choice" onPress={() => act(() => runtime.retryLike(state))} /> : null}
    {state.canRefresh ? <Button label="Check Like status" secondary onPress={() => act(() => runtime.refreshLike(state))} /> : null}
  </>;
}

/** A pending choice contains no retained post projection. The runtime reopens
 * its private address through the ordinary authorized navigation/read path. */
export function NativePendingLike({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(runtime.likes.subscribe, runtime.likes.getSnapshot);
  const act = useLikeAction(runtime, state);
  if (!state.canReviewPending) return null;
  return <Button label="Review pending Like choice" secondary
    onPress={() => act(() => runtime.reviewPendingLike(state))} />;
}
