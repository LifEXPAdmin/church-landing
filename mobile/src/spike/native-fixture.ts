import { API_VERSION, apiContracts, apiPost, encodeApiResponse, encodeNativeResponse, nativePasswordInput,
  type ApiPost } from "@godschurches/shared-core";
import type { NativeWire, NativeWireResponse } from "../platform/request-adapter";
import { createCredentialVault, type TextStore } from "../session/credential-vault";
import { createNativeRuntime } from "../session/runtime";

const origin = "https://mobile-preview.example.invalid";
const owner = "fictional-alex";
const input = Object.freeze({ email: "demo@example.invalid", password: "fictional-preview-password" });
const account = { state: "authenticated" as const, account: { id: owner, name: "Alex, demo member", username: "fictional_alex" } };
const date = "2026-10-07T12:00:00.000Z";
const welcome: ApiPost = apiPost.parse({
  id: "fixture-welcome", type: "UPDATE", audience: "PUBLIC",
  author: { kind: "person", identity: account.account },
  body: { text: "A fictional post for testing the first mobile reading journey. Make room to listen, read and share encouragement.",
    contentNote: null, safeExcerpt: "Welcome to this fictional community.", scripture: null,
    linkUrl: null, linkTitle: null, linkDescription: null },
  publishedAt: date, updatedAt: date, editedAt: null, version: 1, likeCount: 0, commentCount: 0,
  ownReaction: null, canReply: false, discussionClosed: false, requiresWeb: true, repost: null
});
const prayer: ApiPost = apiPost.parse({ ...welcome, id: "fixture-prayer", type: "PRAYER", audience: "CHURCH", likeCount: null,
  author: { kind: "person", identity: { id: "fictional-jordan", name: "Jordan, demo member", username: "fictional_jordan" } },
  body: { ...welcome.body, text: "This fictional prayer request is shown only after you choose to reveal it.",
    contentNote: "A sensitive fictional prayer request", safeExcerpt: "A community member asks for prayer." } });
const { repost: _repost, ...quotedSource } = prayer;
const quote: ApiPost = apiPost.parse({ ...welcome, id: "fixture-quote", type: "TEACHING",
  author: { kind: "church", id: "fictional-church", name: "Fictional Community Church" },
  body: { ...welcome.body, text: "A fictional church shares encouragement.", safeExcerpt: null },
  repost: { kind: "QUOTE", source: quotedSource }, likeCount: 0, discussionClosed: true });
const unavailable: ApiPost = apiPost.parse({ ...welcome, id: "fixture-unavailable", repost: { kind: "PLAIN", source: null } });
const posts = [welcome, prayer, quote, unavailable];
const { repost: _welcomeRepost, ...plainSource } = welcome;
// Direct-detail test address; keep the existing two finite feed pages unchanged.
const plain = apiPost.parse({ ...quote, id: "fixture-repost", repost: { kind: "PLAIN", source: plainSource } });
const details = [...posts, plain];

function memoryStore(): TextStore {
  let value: string | null = null;
  return { async read() { return value; }, async write(next) { value = next; }, async remove() { value = null; } };
}
function response(body: unknown, status = 200): NativeWireResponse {
  return { status, apiVersion: API_VERSION, contentType: "application/json", cacheControl: "no-store", retryAfter: null,
    body: JSON.stringify(body) };
}
const failure = (code: string, status: number) => response({ apiVersion: API_VERSION,
  error: { code, message: "Fictional preview outcome", retryAfterSeconds: null } }, status);

/** Fictional in-memory wire, not an HTTP server or an authorization service.
 * The actual runtime/client/decoders own the journey. No native module, fetch,
 * persistent store, real credential, endpoint fallback or request log exists. */
export function createNativeFixture({ latencyMs = 180 }: { latencyMs?: number } = {}) {
  if (!Number.isSafeInteger(latencyMs) || latencyMs < 0 || latencyMs > 1000) throw Error("Invalid fixture delay.");
  let nonce = 0, issuance = 0, token: string | null = null;
  let nextReadFails = false, nextFeedEmpty = false, nextLikeReplyFails = false, mutationNonce = 0;
  let nextPreferenceReplyFails = false;
  let preference = { ownerId: owner, hideAuthoredReactionCounts: true, version: 0, recoveryRequired: false };
  let lastPreference: { body: string; receipt: { id: string; version: number; message: string } } | null = null;
  const likes = new Map<string, { liked: boolean; version: number }>();
  let lastLike: { path: string; body: string; receipt: { id: string; version: number; message: string } } | null = null;
  const likeState = (id: string) => likes.get(id) ?? { liked: false, version: 0 };
  function withLikes<T extends Pick<ApiPost, "id" | "likeCount" | "author">>(post: T) {
    const own = likeState(post.id);
    const hidden = post.author.kind === "person" && post.author.identity.id === owner && preference.hideAuthoredReactionCounts;
    return { ...post, ownReaction: own, likeCount: hidden || post.likeCount === null ? null : post.likeCount + (own.liked ? 1 : 0) };
  }
  const project = (post: ApiPost): ApiPost => ({ ...withLikes(post),
    repost: post.repost ? { ...post.repost, source: post.repost.source ? withLikes(post.repost.source) : null } : null });
  const secret = memoryStore(), marker = memoryStore();
  const vault = createCredentialVault("development|" + origin, { secret, marker,
    randomId: () => `00000000-0000-4000-8000-${String(++nonce).padStart(12, "0")}` });
  let expires = 0, absolute = 0;
  const activity = () => ({ owner, legacy: false, deadline: new Date(expires).toISOString(),
    absoluteExpiresAt: new Date(absolute).toISOString(), serverTime: new Date().toISOString() });
  function pause(signal: AbortSignal) {
    if (signal.aborted) return Promise.reject(Error("Fictional request cancelled."));
    if (latencyMs === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); signal.removeEventListener("abort", cancel); reject(Error("Fictional request cancelled.")); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", cancel); resolve(); }, latencyMs);
      signal.addEventListener("abort", cancel, { once: true });
    });
  }
  const wire: NativeWire = async request => {
    await pause(request.signal);
    if (request.signal.aborted) throw Error("Fictional request cancelled.");
    const url = new URL(request.url);
    if (url.origin !== origin) throw Error("Only the fictional preview origin is available.");
    const path = url.pathname;
    if (path === "/api/platform/v1/auth/password" && request.method === "POST") {
      const supplied = nativePasswordInput.parse(JSON.parse(request.body ?? "null"));
      if (supplied.email !== input.email || supplied.password !== input.password) return failure("unauthenticated", 401);
      token = String(++issuance).padStart(43, "f");
      absolute = Date.now() + 3600000; expires = Date.now() + 900000;
      return response(encodeNativeResponse("password", { apiVersion: API_VERSION, viewerId: owner,
        data: { tokenType: "Bearer", token, session: account, activity: activity() } }));
    }
    if (!token || request.headers.Authorization !== "Bearer " + token || request.headers["X-Expected-Account"] !== owner || Date.now() >= expires)
      return failure("unauthenticated", 401);
    const envelope = (data: unknown) => ({ apiVersion: API_VERSION, viewerId: owner, data });
    if (path === "/api/platform/v1/session" && request.method === "GET")
      return response(encodeApiResponse("session", envelope(account)));
    if (path === "/api/platform/v1/session/activity") {
      if (request.method === "POST") expires = Math.min(absolute, Date.now() + 900000);
      return response(encodeNativeResponse("activity", envelope(activity())));
    }
    if (path === "/api/platform/v1/session/logout" && request.method === "POST") {
      token = null;
      return response(encodeNativeResponse("logout", envelope({ ownerId: owner, signedOut: true })));
    }
    if (path === "/api/platform/v1/capabilities" && request.method === "GET")
      return response(encodeApiResponse("capabilities", envelope({ supportedVersions: [API_VERSION], features: [
        { name: "feed.read", available: true }, { name: "post.read", available: true },
        { name: "likes.read", available: true }, { name: "likes.write", available: true },
        { name: "reactionPreferences.read", available: true }, { name: "reactionPreferences.write", available: true }] })));
    if (path === "/api/platform/v1/reaction-preferences") {
      if (request.method === "GET") return response(encodeApiResponse("reactionPreferences", envelope(preference)));
      const supplied = apiContracts.setReactionPreferences.body.parse(JSON.parse(request.body ?? "null"));
      const body = JSON.stringify(supplied);
      let receipt = lastPreference?.body === body ? lastPreference.receipt : null;
      if (!receipt) {
        if (supplied.expectedVersion !== preference.version) return failure("conflict", 409);
        preference = { ...preference, hideAuthoredReactionCounts: supplied.hideAuthoredReactionCounts, version: preference.version + 1 };
        receipt = { id: owner, version: preference.version, message: "Fictional count choice saved." };
        lastPreference = { body, receipt };
      }
      if (nextPreferenceReplyFails) { nextPreferenceReplyFails = false; throw Error("Fictional count reply interrupted after saving."); }
      return response(encodeApiResponse("setReactionPreferences", envelope(receipt)));
    }
    const likePost = details.find(item => path === "/api/platform/v1/posts/" + item.id + "/like");
    if (likePost) {
      const target = likePost.repost?.kind === "PLAIN" ? likePost.repost.source : likePost;
      if (!target) return failure("not_found", 404);
      const state = likeState(target.id);
      if (request.method === "POST") {
        const supplied = apiContracts.setLike.body.parse(JSON.parse(request.body ?? "null"));
        const body = JSON.stringify(supplied);
        let receipt = lastLike?.path === path && lastLike.body === body ? lastLike.receipt : null;
        if (!receipt) {
          if (supplied.expectedVersion !== state.version) return failure("conflict", 409);
          const changed = { liked: supplied.desired, version: state.version + 1 };
          likes.set(target.id, changed);
          receipt = { id: target.id, version: changed.version, message: changed.liked ? "Post liked." : "Like removed." };
          // One pending client command permits one bounded fictional receipt.
          lastLike = { path, body, receipt };
        }
        if (nextLikeReplyFails) { nextLikeReplyFails = false; throw Error("Fictional Like reply interrupted after saving."); }
        return response(encodeApiResponse("setLike", envelope(receipt)));
      }
      if (request.method !== "GET") return failure("not_found", 404);
      return response(encodeApiResponse("like", envelope({ id: target.id, ...state,
        count: withLikes(target).likeCount })));
    }
    if (request.method !== "GET") return failure("not_found", 404);
    if (nextReadFails) { nextReadFails = false; throw Error("Fictional connection interruption."); }
    if (path === "/api/platform/v1/feed") {
      const query = apiContracts.feed.query.parse({ mode: url.searchParams.get("mode"), scope: url.searchParams.get("scope"), cursor: url.searchParams.get("cursor") });
      const page = query.cursor === "fixture.second" ? 1 : 0;
      const empty = nextFeedEmpty; nextFeedEmpty = false;
      return response(encodeApiResponse("feed", envelope({ mode: query.mode, scope: "fictional-scope",
        pageCursor: page ? "fixture.second" : "fixture.first", notice: null,
        page: { items: empty ? [] : posts.slice(page * 2, page * 2 + 2).map(project), nextCursor: empty || page ? null : "fixture.second" } })));
    }
    const post = details.find(item => path === "/api/platform/v1/posts/" + item.id);
    return post ? response(encodeApiResponse("post", envelope(project(post)))) : failure("not_found", 404);
  };
  const runtime = createNativeRuntime({ mutationId: () => "fixture-choice-" + ++mutationNonce, configuration: { environment: "development", origin }, wire, vault,
    availability: { screens: ["home"], resources: ["post"] } });
  return Object.freeze({ runtime, credentials: input,
    signIn: () => runtime.signIn(input),
    failNextRead() { nextReadFails = true; },
    interruptNextLikeReply() { nextLikeReplyFails = true; },
    interruptNextPreferenceReply() { nextPreferenceReplyFails = true; },
    emptyNextFeed() { nextFeedEmpty = true; }
  });
}
