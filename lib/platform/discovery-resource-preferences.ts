import {
  DISCOVERY_RESOURCE_KINDS,
  type DiscoveryPreferences
} from "./discovery-options";
import {
  postReadableWhere,
  type PostContext,
  type PostTx
} from "./post-access";
import { resolvePostResourcesIn } from "./post-resource-attachments";
import {
  POST_RESOURCE_LIMIT,
  resourceKey,
  storedPostResources,
  type PostResourceReference
} from "./post-resource-input";
import { PortalError } from "./portal-policy";

export function hasDiscoveryResourceExclusions(prefs: DiscoveryPreferences) {
  return DISCOVERY_RESOURCE_KINDS.some(
    (kind) => !prefs.filters.resources.includes(kind)
  );
}

/** Classify only currently readable cards, never a retained private reference. */
export async function discoveryResourceHiddenIds(
  tx: PostTx,
  context: PostContext,
  postIds: string[],
  prefs: DiscoveryPreferences
): Promise<Set<string>> {
  const hidden = new Set<string>();
  if (!postIds.length || !hasDiscoveryResourceExclusions(prefs)) return hidden;
  const ids = [...new Set(postIds)];
  // A bounded 10,000-entry reading set may reference 10,000 distinct originals.
  if (ids.length > 20000)
    throw new PortalError(
      503,
      "These resource choices need a smaller reading set."
    );
  const excluded = new Set(
    DISCOVERY_RESOURCE_KINDS.filter(
      (kind) => !prefs.filters.resources.includes(kind)
    )
  );
  const posts = await tx.platformPost.findMany({
    where: { AND: [{ id: { in: ids } }, postReadableWhere(context)] },
    select: {
      id: true,
      type: true,
      authorChurchId: true,
      resourceReferences: true,
      eventOccurrenceId: true,
      exchangeNeedId: true
    }
  });
  type ResourceEntry = { reference: PostResourceReference; posts: Set<string> };
  const references = new Map<string, ResourceEntry>();
  const add = (postId: string, reference: PostResourceReference) => {
    if (!excluded.has(reference.kind)) return;
    const key = resourceKey(reference);
    const row = references.get(key);
    if (row) row.posts.add(postId);
    else references.set(key, { reference, posts: new Set([postId]) });
  };
  const attached = posts.map((post) => ({
    id: post.id,
    references: storedPostResources(post.resourceReferences)
  }));
  // Check one association per post first, so a matching first card lets later
  // cards be skipped instead of resolving every resource on an excluded post.
  for (let position = 0; position < POST_RESOURCE_LIMIT; position++)
    for (const post of attached) {
      const reference = post.references[position];
      if (reference) add(post.id, reference);
    }
  if (excluded.has("eventOccurrence"))
    for (const post of posts)
      if (post.eventOccurrenceId)
        add(post.id, { kind: "eventOccurrence", id: post.eventOccurrenceId });
  const needIds = posts.flatMap((post) =>
    post.type === "NEED" && post.exchangeNeedId ? [post.exchangeNeedId] : []
  );
  if (excluded.has("exchangeListing") && needIds.length) {
    const needs = await tx.exchangeNeed.findMany({
      where: { id: { in: [...new Set(needIds)] }, recoveryRequired: false },
      select: {
        id: true,
        listingId: true,
        listing: { select: { ownerChurchId: true } }
      }
    });
    const byId = new Map(needs.map((need) => [need.id, need]));
    for (const post of posts) {
      const need = byId.get(post.exchangeNeedId ?? "");
      if (
        post.type === "NEED" &&
        post.authorChurchId &&
        need?.listingId &&
        need.listing &&
        post.authorChurchId === need.listing.ownerChurchId
      )
        add(post.id, { kind: "exchangeListing", id: need.listingId });
    }
  }
  const churchPostIds = posts.flatMap((post) =>
    post.authorChurchId ? [post.id] : []
  );
  if (excluded.has("volunteerOpportunity") && churchPostIds.length) {
    // Canonical volunteer commands permit at most twelve opportunities per post.
    // Detect retained rows beyond that limit rather than silently truncating them.
    const opportunities = await tx.volunteerOpportunity.findMany({
      where: { postId: { in: churchPostIds }, recoveryRequired: false },
      select: { id: true, postId: true },
      orderBy: [{ postId: "asc" }, { id: "asc" }],
      take: churchPostIds.length * 12 + 1
    });
    const byPost = new Map<string, string[]>();
    for (const opportunity of opportunities) {
      const list = byPost.get(opportunity.postId!) ?? [];
      list.push(opportunity.id);
      if (list.length > 12)
        throw new PortalError(
          503,
          "These resource choices need an opportunity capacity review."
        );
      byPost.set(opportunity.postId!, list);
    }
    for (let position = 0; position < 12; position++)
      for (const [postId, list] of byPost) {
        const id = list[position];
        if (id) add(postId, { kind: "volunteerOpportunity", id });
      }
  }
  let batch: ResourceEntry[] = [];
  const flush = async () => {
    if (!batch.length) return;
    // The canonical resolver keeps its page bound and fresh media rights/clock
    // checks. A feed snapshot freezes ordering, never source permission or expiry.
    const resolved = await resolvePostResourcesIn(
      tx,
      context,
      batch.map((row) => row.reference)
    );
    for (const row of batch)
      if (resolved.has(resourceKey(row.reference)))
        for (const postId of row.posts) hidden.add(postId);
    batch = [];
  };
  for (const row of references.values()) {
    if ([...row.posts].every((postId) => hidden.has(postId))) continue;
    batch.push(row);
    if (batch.length === 180) await flush();
  }
  await flush();
  return hidden;
}
