/** Server capability admission policy. This never grants account or resource access. */
import { API_VERSION } from "./api-contracts";

const essential = [
  "session.read",
  "session.activity",
  "session.logout",
  "session.authenticator"
] as const;
const optional = [
  "session.password",
  "feed.read",
  "post.read",
  "profile.read",
  "churches.read",
  "church.read",
  "likes.read",
  "likes.write",
  "reactionPreferences.read",
  "reactionPreferences.write",
  "comments.read",
  "bookmarks.read",
  "bookmarks.write",
  "media.images.read",
  "media.images.list",
  "media.images.upload",
  "media.images.remove"
] as const;
const unimplemented = [
  "session.google",
  "comments.write",
  "posts.write",
  "media.read",
  "push"
] as const;
export type NativeFeature =
  | (typeof essential)[number]
  | (typeof optional)[number];
export class NativePolicyError extends Error {
  readonly code: "validation" | "unsupported_version" | "feature_unavailable";
  constructor(
    code: "validation" | "unsupported_version" | "feature_unavailable"
  ) {
    super(
      code === "unsupported_version"
        ? "This API version is unavailable. Keep your drafts and use a supported app version."
        : code === "feature_unavailable"
          ? "This feature is temporarily unavailable. Keep your drafts and retry later with the same request reference."
          : "Use the API version supported by this request path."
    );
    this.code = code;
  }
}

/** A header can confirm the path major, never negotiate a different behavior. */
export function requireNativeProtocol(path: string, declared: string | null) {
  const major = /^\/api\/platform\/v([1-9][0-9]{0,7})(?:\/|$)/.exec(path)?.[1];
  if (!major || (declared !== null && !/^[1-9][0-9]{0,7}$/.test(declared)))
    throw new NativePolicyError("validation");
  if (major !== API_VERSION || (declared !== null && declared !== major))
    throw new NativePolicyError("unsupported_version");
}

/** Unknown/invalid pause configuration closes optional admission, never enables a feature. */
export function nativeCapabilityPolicy(
  raw = process.env.NATIVE_API_DISABLED_FEATURES
) {
  const values = raw?.trim() ? raw.split(",").map((s) => s.trim()) : [];
  const configured = new Set(values);
  const valid =
    (raw?.length ?? 0) <= 4096 &&
    values.length <= optional.length &&
    configured.size === values.length &&
    values.every((name) => optional.some((feature) => feature === name));
  const features = [
    ...essential.map((name) => ({ name, available: true })),
    ...optional.map((name) => ({
      name,
      available: valid && !configured.has(name)
    })),
    ...unimplemented.map((name) => ({ name, available: false }))
  ];
  return { supportedVersions: [API_VERSION], features };
}

export function requireNativeFeature(name: NativeFeature) {
  if (
    !nativeCapabilityPolicy().features.some(
      (f) => f.name === name && f.available
    )
  )
    throw new NativePolicyError("feature_unavailable");
}
