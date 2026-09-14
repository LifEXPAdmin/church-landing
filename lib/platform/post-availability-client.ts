import { socialRequest } from "./social-client";

export type PostAvailability = {
  id: string;
  available: boolean;
  entryVersion: number | null;
  commentCount: number | null;
  likeCount: number | null;
};
type Waiting = {
  id: string;
  resolve: (value: PostAvailability) => void;
  reject: (error: unknown) => void;
};

// Coalesce checks from the same render/focus event, never cache a response.
// Account queues are separate; every response uses the existing pinned transport.
const queued = new Map<string | null, Waiting[]>();
export function currentPostAvailability(id: string, owner: string | null) {
  return new Promise<PostAvailability>((resolve, reject) => {
    const waiting = queued.get(owner);
    if (waiting) waiting.push({ id, resolve, reject });
    else {
      queued.set(owner, [{ id, resolve, reject }]);
      setTimeout(() => void flush(owner), 0);
    }
  });
}
async function flush(owner: string | null) {
  const waiting = queued.get(owner) ?? [];
  queued.delete(owner);
  const ids = [...new Set(waiting.map((item) => item.id))];
  for (let offset = 0; offset < ids.length; offset += 30) {
    const group = ids.slice(offset, offset + 30);
    const listeners = waiting.filter((item) => group.includes(item.id));
    try {
      const query = new URLSearchParams({ view: "availability-batch" });
      group.forEach((id) => query.append("postId", id));
      const { data } = await socialRequest<{ posts: PostAvailability[] }>(
        `/api/platform/posts?${query}`,
        undefined,
        owner
      );
      for (const listener of listeners) {
        const value = data.posts.find((post) => post.id === listener.id);
        if (!value)
          listener.reject(new Error("Post access was not confirmed."));
        else listener.resolve(value);
      }
    } catch (error) {
      listeners.forEach((listener) => listener.reject(error));
    }
  }
}
