/** Fictional spike data only. This is not a duplicate wire or authorization contract. */
export type FixturePost = {
  id: string;
  author: string;
  title: string;
  body: string;
  contentNote: string | null;
  excerpt: string;
};
export const fixturePosts: readonly FixturePost[] = [
  { id: "fixture-welcome", author: "Alex, demo account", title: "Welcome to the community",
    body: "A fictional post for testing the first mobile reading journey.",
    contentNote: null, excerpt: "A place to connect, encourage and grow." },
  { id: "fixture-prayer", author: "Jordan, demo account", title: "Making room for prayer",
    body: "This fictional content is shown only after you choose to reveal it.",
    contentNote: "A sensitive prayer request", excerpt: "A community member asks for prayer." }
];
export type FixtureReader = (signal: AbortSignal) => Promise<readonly FixturePost[]>;
/** An asynchronous fixture boundary; no network or real account access. */
export const readFixture: FixtureReader = async (signal) => {
  if (signal.aborted) throw new Error("Fixture request cancelled.");
  return fixturePosts.map((post) => ({ ...post }));
};
