import { prisma } from "@/lib/prisma";
import { handleVolunteerDutyTemplateRequest } from "@/lib/platform/volunteer-duty-template-boundary";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleVolunteerDutyTemplateRequest(prisma, request);
export const POST = GET;
