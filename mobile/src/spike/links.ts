/** Exact local spike links only. Universal links and OAuth belong to separate contracts. */
export function fixturePostFromLink(value: string): string | null {
  if (value.length > 160) return null;
  const match = /^(?:godschurches-dev|godschurches-staging):\/\/spike\/post\/(fixture-welcome|fixture-prayer)$/.exec(value);
  return match?.[1] ?? null;
}
