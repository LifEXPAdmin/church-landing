import { prisma } from "@/lib/prisma";
import { privateCookies } from "./private-cookies";
import { PLATFORM_SESSION_COOKIE } from "./session";
import {
  listTopics,
  readTopic,
  readTopicManagement,
  topicEligibility,
  topicFollowingAccess
} from "./topic-communities";

async function token() {
  if (process.env.NODE_ENV !== "production") return undefined;
  return (await privateCookies()).get(PLATFORM_SESSION_COOKIE)?.value;
}
export async function topicPage(address: string) {
  return readTopic(prisma, await token(), address);
}
export async function topicManagementPage(
  address: string,
  after?: string,
  auditAfter?: string
) {
  return readTopicManagement(prisma, await token(), address, after, auditAfter);
}
export async function topicListPage(query: Parameters<typeof listTopics>[2]) {
  return listTopics(prisma, await token(), query);
}
export async function topicAccountPage() {
  return topicEligibility(prisma, await token());
}
export async function topicFollowingPage() {
  return topicFollowingAccess(prisma, await token());
}
