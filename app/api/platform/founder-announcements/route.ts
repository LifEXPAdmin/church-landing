import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleFounderAnnouncementRequest } from "@/lib/platform/founder-announcement-boundary";
import { dispatchFounderAnnouncements } from "@/lib/platform/founder-announcement-queue";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleFounderAnnouncementRequest(prisma, request);
export const POST = (request: Request) =>
  handleFounderAnnouncementRequest(prisma, request, (id) =>
    after(async () => {
      try {
        if ((await dispatchFounderAnnouncements(prisma, id)).failed)
          console.error("founder_announcement_handoff_incomplete");
      } catch {
        console.error("founder_announcement_handoff_incomplete");
      }
    })
  );
