import { createHmac, timingSafeEqual } from "node:crypto";
import { accountConfig } from "./account-config";
import { PortalError } from "./portal";
import {
  fetchPostPreview,
  publicPostUrl,
  validatePostLink,
  UnsafePostLink,
  type LinkMetadata,
  type LinkTransport
} from "./post-link-fetch";

export type PostLink = {
  linkUrl: string | null;
  linkTitle: string | null;
  linkDescription: string | null;
  linkSourceUrl: string | null;
};
export const emptyPostLink: PostLink = {
  linkUrl: null,
  linkTitle: null,
  linkDescription: null,
  linkSourceUrl: null
};
function signature(payload: string) {
  return createHmac(
    "sha256",
    accountConfig().rateSecret + ":post-link-receipt:v1"
  )
    .update(payload)
    .digest();
}
export function signPostPreview(
  actorId: string,
  url: string,
  preview: LinkMetadata | null,
  now = Date.now()
) {
  const payload = Buffer.from(
    JSON.stringify({ actorId, url, preview, expires: now + 20 * 60 * 1000 })
  ).toString("base64url");
  return payload + "." + signature(payload).toString("base64url");
}
export function readPostPreview(
  receipt: unknown,
  actorId: string,
  url: string,
  now = Date.now()
): { preview: LinkMetadata | null } | null {
  if (typeof receipt !== "string" || receipt.length > 8192) return null;
  try {
    const [payload, mac, extra] = receipt.split(".");
    if (!payload || !mac || extra !== undefined) return null;
    const expected = signature(payload),
      actual = Buffer.from(mac, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      data.actorId !== actorId ||
      data.url !== url ||
      !Number.isFinite(data.expires) ||
      data.expires <= now ||
      data.expires > now + 20 * 60 * 1000
    )
      return null;
    return { preview: data.preview as LinkMetadata | null };
  } catch {
    return null;
  }
}
export async function previewPostLink(
  actorId: string,
  value: unknown,
  io?: LinkTransport,
  signal?: AbortSignal
) {
  try {
    const url = publicPostUrl(value).href;
    const preview = await fetchPostPreview(url, io, signal);
    return {
      url,
      preview,
      receipt: signPostPreview(actorId, url, preview),
      message: preview
        ? "Preview ready. You can remove it and keep the link."
        : "A preview is unavailable. You can still publish this as a plain link."
    };
  } catch (error) {
    if (error instanceof UnsafePostLink)
      throw new PortalError(400, error.message);
    throw error;
  }
}
export async function preparePostLink(
  actorId: string,
  input: Record<string, unknown>,
  existing?: PostLink,
  io?: LinkTransport
): Promise<PostLink> {
  const stored = existing
    ? {
        linkUrl: existing.linkUrl,
        linkTitle: existing.linkTitle,
        linkDescription: existing.linkDescription,
        linkSourceUrl: existing.linkSourceUrl
      }
    : emptyPostLink;
  if (input.linkUrl === undefined) return stored;
  if (input.linkUrl === "" || input.linkUrl === null) return emptyPostLink;
  try {
    const url = publicPostUrl(input.linkUrl).href;
    const receipt = readPostPreview(input.linkReceipt, actorId, url);
    if (receipt) {
      const preview = input.keepLinkPreview === true ? receipt.preview : null;
      return {
        linkUrl: url,
        linkTitle: preview?.title ?? null,
        linkDescription: preview?.description ?? null,
        linkSourceUrl: preview?.sourceUrl ?? null
      };
    }
    if (existing?.linkUrl === url && input.keepLinkPreview === true)
      return stored;
    // New or changed links without a valid receipt receive DNS validation only.
    // A stale receipt never makes publication depend on fetching external HTML.
    await validatePostLink(url, io);
    return { ...emptyPostLink, linkUrl: url };
  } catch (error) {
    if (error instanceof UnsafePostLink)
      throw new PortalError(400, error.message);
    throw error;
  }
}
