import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import { getPostParticipation } from "./post-participation-reads";
import { getPostEditor } from "./post-editor";
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
export async function readPosts(query: PostQuery = {}) {
  return listPosts(prisma, await token(), query);
}
export async function readPostParticipation(id: string) {
  return getPostParticipation(prisma, await token(), id);
}
export async function readPostEditor(id: string) {
  return getPostEditor(prisma, await token(), id);
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
