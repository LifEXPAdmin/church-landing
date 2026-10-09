import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import type { createNativeRuntime } from "../session/runtime";
import type { ReactionPreferencesProblem, ReactionPreferencesSnapshot } from "../interactions/reaction-preferences-controller";
import { Button, Text } from "./primitives";

type Runtime = ReturnType<typeof createNativeRuntime>;
const messages: Record<ReactionPreferencesProblem, string> = {
  unavailable: "Your count setting could not be checked. Try again when your connection is available.",
  "feature-unavailable": "Changing count settings is currently unavailable in the app.",
  "refresh-required": "Your setting changed or this choice was rejected. Check the current setting before choosing again.",
  "recovery-required": "Your account needs attention on the website before you can continue.",
  "update-required": "Update the app before changing count settings.",
  "rate-limited": "Please wait before trying again.",
  unconfirmed: "Your count choice could not be confirmed. Retry the same choice to check its outcome."
};
function usePreferenceAction(runtime: Runtime, state: ReactionPreferencesSnapshot) {
  const mounted = useRef<Runtime | null>(null), flight = useRef<object | null>(null);
  useLayoutEffect(() => {
    mounted.current = runtime; flight.current = null;
    return () => { if (mounted.current === runtime) mounted.current = null; };
  }, [runtime]);
  return (command: () => Promise<unknown>) => {
    if (mounted.current !== runtime || flight.current || runtime.reactionPreferences.getSnapshot() !== state) return;
    const operation = {}; flight.current = operation;
    void runtime.recordForegroundActivity();
    void command().finally(() => { if (flight.current === operation) flight.current = null; });
  };
}

/** Account preference only. The server projects counts for every reader; this
 * control does not change post audiences or a local reading display preference. */
export function NativeReactionPreferences({ runtime }: { runtime: Runtime }) {
  const state = useSyncExternalStore(runtime.reactionPreferences.subscribe, runtime.reactionPreferences.getSnapshot);
  const act = usePreferenceAction(runtime, state);
  const message = state.problem ? messages[state.problem] : state.phase === "saving" ? "Saving your count choice..." :
    state.phase === "loading" ? "Checking your count setting..." : null;
  useEffect(() => {
    if (Platform.OS === "ios" && message && runtime.session.getSnapshot().foreground &&
      runtime.reactionPreferences.getSnapshot() === state) AccessibilityInfo.announceForAccessibility(message);
  }, [runtime, state, message]);
  if (state.phase === "concealed") return null;
  if (!state.open) return <>
    {state.hasPending ? <Text>Your count choice still needs confirmation. Review it before returning to posts.</Text> : null}
    <Button label={state.hasPending ? "Review pending count choice" : "Reaction count settings"} secondary
      onPress={() => act(() => runtime.openReactionPreferences(state))} />
  </>;
  return <>
    <Text variant="title">Reaction count settings</Text>
    <Text>Hide Like and prayer totals on your own personal posts and comments. People can still react. Church totals, comment totals and who can see your content stay the same.</Text>
    {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    {state.hasPending ? <Text>Your earlier choice is still pending. Posts will return after that choice is confirmed. Checking the current setting does not retry the save.</Text> : null}
    {state.hideCounts !== null ? <>
      <Text>{state.hasPending ? state.hideCounts ? "Last checked setting: totals hidden." : "Last checked setting: totals shown." :
        state.hideCounts ? "Current setting: totals hidden." : "Current setting: totals shown."}</Text>
      {state.recoveryRequired ? <Text>Totals are hidden while your setting needs recovery. Choose a setting to save a protected choice.</Text> : null}
      <Button label="Hide my reaction totals" secondary selected={state.hideCounts}
        disabled={!state.canChoose || state.hideCounts && !state.recoveryRequired}
        onPress={() => act(() => runtime.setReactionPreferences(state, true))} />
      <Button label="Show my reaction totals" secondary selected={!state.hideCounts}
        disabled={!state.canChoose || !state.hideCounts && !state.recoveryRequired}
        onPress={() => act(() => runtime.setReactionPreferences(state, false))} />
    </> : null}
    {state.problem === "rate-limited" && state.retryAfterSeconds !== null ?
      <Text variant="small" tone="muted">The server requested a pause of {state.retryAfterSeconds} seconds.</Text> : null}
    {state.canRetry ? <Button label="Retry same count choice" onPress={() => act(() => runtime.retryReactionPreferences(state))} /> : null}
    {state.canRefresh ? <Button label="Check current count setting" secondary onPress={() => act(() => runtime.refreshReactionPreferences(state))} /> : null}
    <Button label="Back to posts" secondary disabled={!state.canClose}
      onPress={() => act(() => runtime.closeReactionPreferences(state))} />
  </>;
}
