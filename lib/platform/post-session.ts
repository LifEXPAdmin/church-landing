import { readFeed } from "./feed-reads";
import { GUEST_FEED_COOKIE } from "./feed-options";
import { GUEST_DISCOVERY_COOKIE } from "./discovery-options";
import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { getPostParticipation } from "./post-participation-reads";
import { getPostEditor, getScheduledPosts } from "./post-editor";
import {
  getPost,
  getChurchPostFeed,
  getProfilePosts,
  listPosts,
  type PostQuery
} from "./post-reads";

async function token() {
  // Development diagnostics may serialize server component work. Private church
  // content is exercised through the isolated production renderer instead.
  if (process.env.NODE_ENV !== "production") return undefined;
  return (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value;
}
export async function readHomeFeed(input: {
  mode?: string;
  cursor?: string;
  scope?: string;
  refresh?: string;
  legacyThrough?: string;
  legacyAnchor?: string;
  legacyBefore?: string;
  legacyCursor?: string;
}) {
  const guestMode = (await privateCookies()).get(GUEST_FEED_COOKIE)?.value;
  const guestDiscovery = (await privateCookies()).get(
    GUEST_DISCOVERY_COOKIE
  )?.value;
  return readFeed(prisma, await token(), {
    ...input,
    guestMode,
    guestDiscovery
  });
}
export async function readPosts(query: PostQuery = {}) {
  return listPosts(prisma, await token(), query);
}
export async function readPostParticipation(id: string) {
  return getPostParticipation(prisma, await token(), id);
}
export async function readPostEditor(id: string) {
  return getPostEditor(prisma, await token(), id);
}
export async function readScheduledPosts(after?: string) {
  return getScheduledPosts(prisma, await token(), after);
}
export async function readChurchPostFeed(
  churchId: string,
  query: Pick<PostQuery, "before" | "cursor"> = {}
) {
  return getChurchPostFeed(prisma, await token(), churchId, query);
}
export async function readPost(
  id: string,
  query: { before?: Date | null; cursor?: string | null } = {}
) {
  return getPost(prisma, await token(), id, query);
}
export async function readProfilePosts(
  authorId: string,
  query: { before?: Date | null; cursor?: string | null } = {}
) {
  return getProfilePosts(prisma, await token(), authorId, query);
}
