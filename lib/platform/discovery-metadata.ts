import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { publicMetadata } from "../site-metadata";
import {
  indexingEnvironment,
  publicPageIdentity,
  type PublicQuery
} from "../indexing-policy";
import { publicChurchWhere } from "./public-discovery-policy";
import { topicPublicWhere } from "./topic-policy";

export async function discoveryMetadata(
  kind: "churches" | "topics",
  query: PublicQuery
): Promise<Metadata> {
  noStore();
  const cursorKey = kind === "churches" ? "cursor" : "after";
  const identity = publicPageIdentity("/platform/" + kind, query, [cursorKey]);
  const cursor =
    typeof query[cursorKey] === "string" ? query[cursorKey] : undefined;
  let useful = false;
  if (!identity.filtered) {
    try {
      if (kind === "churches") {
        const valid =
          !cursor ||
          (await prisma.church.findFirst({
            where: { ...publicChurchWhere, id: cursor },
            select: { id: true }
          }));
        useful =
          !!valid &&
          !!(await prisma.church.findFirst({
            where: publicChurchWhere,
            select: { id: true },
            orderBy: [{ name: "asc" }, { id: "asc" }],
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
          }));
      } else {
        const valid =
          !cursor ||
          (await prisma.topicCommunity.findFirst({
            where: { ...topicPublicWhere, id: cursor },
            select: { id: true }
          }));
        useful =
          !!valid &&
          !!(await prisma.topicCommunity.findFirst({
            where: topicPublicWhere,
            select: { id: true },
            orderBy: [{ nameKey: "asc" }, { id: "asc" }],
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
          }));
      }
    } catch {
      /* An unavailable or no-longer-public cursor cannot be indexed. */
    }
  }
  const metadata = publicMetadata(
    kind === "churches" ? "Find your church" : "Topic communities",
    kind === "churches"
      ? "Explore church listings, supplied public details and published community events. Each listing explains its management status."
      : "Explore public communities and conversations about faith and everyday life.",
    identity.path
  );
  return {
    ...metadata,
    robots: {
      index: indexingEnvironment().index && useful && !identity.filtered,
      follow: true
    }
  };
}
