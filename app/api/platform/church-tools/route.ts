import { prisma } from "@/lib/prisma";
import { requestSessionToken } from "@/lib/platform/account-boundary";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "@/lib/platform/social-boundary";
import { readChurchTools } from "@/lib/platform/church-tools";
import { readOnboarding, saveOnboarding } from "@/lib/platform/onboarding";
import { readChurchWelcomeHost } from "@/lib/platform/church-welcome-host";
import {
  readWelcomePost,
  saveChurchWelcome
} from "@/lib/platform/church-welcome-commands";
import { readAccountSession } from "@/lib/platform/accounts";
import { PortalError } from "@/lib/platform/portal-policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const token = requestSessionToken(request),
      query = new URL(request.url).searchParams;
    const owner = request.headers.get("x-expected-account");
    if (owner && (await readAccountSession(prisma, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    let result;
    if (query.get("view") === "home")
      result = await readOnboarding(prisma, token, query.get("churchId"));
    else if (query.get("view") === "welcome")
      result = await readChurchWelcomeHost(prisma, token, {
        churchId: query.get("churchId"),
        from: query.get("from") ?? undefined,
        until: query.get("until") ?? undefined,
        after: query.get("after"),
        queue: query.get("queue") ?? undefined
      });
    else if (query.get("view") === "post")
      result = await readWelcomePost(
        prisma,
        token,
        query.get("churchId"),
        query.get("postId")
      );
    else if (!query.get("view"))
      result = await readChurchTools(prisma, token, query.get("churchId"));
    else throw new PortalError(400, "Choose a supported church tools view.");
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!request.headers.get("x-expected-account"))
      throw new PortalError(
        401,
        "Reload to confirm which account will save this change."
      );
    const { input, token } = await socialWriteInput(
      prisma,
      request,
      "church-welcome"
    );
    const result =
      input.operation === "onboarding"
        ? await saveOnboarding(prisma, token, input)
        : await saveChurchWelcome(prisma, token, input);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    return socialError(error);
  }
}
