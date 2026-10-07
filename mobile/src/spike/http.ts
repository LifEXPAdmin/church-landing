import type { FixturePost, FixtureReader } from "./fixture.ts";

type FetchFixture = typeof fetch;
const fixtureOrigin = /^http:\/\/(?:127\.0\.0\.1|10\.0\.2\.2):4084$/;
/** Local fictional spike transport only. Replace with the canonical client receipt for real data. */
export function createFixtureHttpReader(origin: string, request: FetchFixture = fetch): FixtureReader {
  if (!fixtureOrigin.test(origin)) throw new Error("Only the isolated local fixture server is permitted.");
  return async (signal) => {
    if (signal.aborted) throw new Error("Fixture request cancelled.");
    const timeout = new AbortController();
    const cancel = () => timeout.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(cancel, 8000);
    try {
      const response = await request(origin + "/spike/feed", {
        method: "GET", credentials: "omit", redirect: "error", cache: "no-store", signal: timeout.signal
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("application/json")) throw new Error("Fixture unavailable.");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming fixture response unavailable.");
      const buffer = new Uint8Array(16000);
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (timeout.signal.aborted || value.byteLength > buffer.length - size) throw new Error("Fixture response exceeds its byte limit.");
          buffer.set(value, size);
          size += value.byteLength;
        }
      } finally { await reader.cancel().catch(() => {}); }
      if (timeout.signal.aborted) throw new Error("Fixture request cancelled.");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size));
      const value: unknown = JSON.parse(text);
      if (!value || typeof value !== "object" || !("kind" in value) || value.kind !== "fictional-spike" || !("posts" in value) || !Array.isArray(value.posts) || value.posts.length > 30)
        throw new Error("Invalid fixture response.");
      return value.posts.map((post: unknown): FixturePost => {
        if (!post || typeof post !== "object") throw new Error("Invalid fixture post.");
        const p = post as Record<string, unknown>;
        for (const [key, max] of [["id", 100], ["author", 120], ["title", 120], ["body", 3000], ["excerpt", 160]] as const)
          if (typeof p[key] !== "string" || p[key].length > max) throw new Error("Invalid fixture text.");
        if (p.contentNote !== null && (typeof p.contentNote !== "string" || p.contentNote.length > 120)) throw new Error("Invalid fixture note.");
        return { id: p.id as string, author: p.author as string, title: p.title as string, body: p.body as string, excerpt: p.excerpt as string, contentNote: p.contentNote as string | null };
      });
    } finally {
      timeout.abort();
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
    }
  };
}
