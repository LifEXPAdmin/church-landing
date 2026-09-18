-- Measured on the dense multi-owner listing fixture. No permission or cursor
-- predicates change; one ascending price index also serves the reverse walk.
CREATE INDEX "ExchangeListing_price_order_idx" ON "ExchangeListing"
  ("currency", "intent", "state", "priceMinor", "publishedAt" DESC, "id" DESC);
