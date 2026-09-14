-- Preserve the canonical visibility predicate while supplying its page order.
-- The dense hosted rehearsal otherwise sorted nearly 98,000 candidate posts
-- before returning 31 rows, and exhausted the small database's memory.
CREATE INDEX "PlatformPost_visible_feed_idx"
ON "PlatformPost"("status", "moderationState", "publishedAt" DESC, "id" DESC);
