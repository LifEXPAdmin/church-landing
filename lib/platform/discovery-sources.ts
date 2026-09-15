import type { PostContext, PostTx } from "./post-access";
import { repostSourceWhere } from "./repost-policy";
import { discoveryHiddenWhere } from "./discovery-policy";
import type { DiscoveryPreferences } from "./discovery-options";
// Mirror the canonical reader's current original-source and between-author block
// boundary before using any source classification or hidden-word signal.
export async function discoverySources(
  tx: PostTx,
  context: PostContext,
  entries: { id: string; authorId: string; repostSourceId: string | null }[],
  now: Date,
  prefs: DiscoveryPreferences
) {
  const ids = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.repostSourceId ? [entry.repostSourceId] : []
      )
    )
  ];
  const sources = ids.length
    ? await tx.platformPost.findMany({
        where: { AND: [{ id: { in: ids } }, repostSourceWhere(context, now)] },
        select: {
          id: true,
          authorId: true,
          authorChurchId: true,
          audienceChurchId: true,
          publishedAt: true,
          topics: true,
          discoveryCountry: true,
          discoveryLanguage: true,
          discoveryDenomination: true,
          discoveryRegion: true,
          discoveryLatitude: true,
          discoveryLongitude: true
        }
      })
    : [];
  const byId = new Map(sources.map((source) => [source.id, source]));
  const pairs = entries.flatMap((entry) => {
    const source = byId.get(entry.repostSourceId ?? "");
    return source &&
      !source.authorChurchId &&
      source.authorId !== entry.authorId
      ? [
          { ownerId: source.authorId, targetUserId: entry.authorId },
          { ownerId: entry.authorId, targetUserId: source.authorId }
        ]
      : [];
  });
  const blocks = pairs.length
    ? await tx.socialRelationship.findMany({
        where: { blocked: true, OR: pairs },
        select: { ownerId: true, targetUserId: true }
      })
    : [];
  const allowedHidden =
    (prefs.hiddenWords.length || prefs.hiddenTopics.length) && sources.length
      ? new Set(
          (
            await tx.platformPost.findMany({
              where: {
                AND: [
                  { id: { in: sources.map((source) => source.id) } },
                  discoveryHiddenWhere(context, prefs)
                ]
              },
              select: { id: true }
            })
          ).map((source) => source.id)
        )
      : new Set(sources.map((source) => source.id));
  const byEntry = new Map<string, (typeof sources)[number]>(),
    hiddenEntries = new Set<string>();
  for (const entry of entries) {
    const source = byId.get(entry.repostSourceId ?? "");
    if (
      !source ||
      (!source.authorChurchId &&
        blocks.some(
          (block) =>
            (block.ownerId === source.authorId &&
              block.targetUserId === entry.authorId) ||
            (block.ownerId === entry.authorId &&
              block.targetUserId === source.authorId)
        ))
    )
      continue;
    byEntry.set(entry.id, source);
    if (!allowedHidden.has(source.id)) hiddenEntries.add(entry.id);
  }
  return { byEntry, hiddenEntries };
}
