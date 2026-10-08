import type { ReadingSnapshot } from "../reading/read-controller";
import { Button } from "./primitives";

type FeedMode = Extract<ReadingSnapshot, { kind: "feed" }>["feed"]["mode"];
const choices = [
  { mode: "latest", label: "Latest" },
  { mode: "friends", label: "Friends" },
  { mode: "weekly", label: "Top This Week" },
  { mode: "trending", label: "Trending" }
] as const satisfies ReadonlyArray<{ mode: FeedMode; label: string }>;

/** Presentation only. The caller supplies the authorized response mode and
 * owns user activity and runtime commands. The parent supplies themed spacing. */
export function NativeFeedChoices({ mode, onChoose, onRefresh }: {
  mode: FeedMode;
  onChoose: (mode: FeedMode) => void;
  onRefresh: () => void;
}) {
  return <>
    {choices.map(choice => <Button key={choice.mode} label={choice.label} secondary
      selected={mode === choice.mode} onPress={() => onChoose(choice.mode)} />)}
    <Button label="Refresh feed" secondary onPress={onRefresh} />
  </>;
}
