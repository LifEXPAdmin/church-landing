import type { PrismaClient } from "@prisma/client";
import { requestSessionToken } from "./account-boundary";
import { readAccountSession } from "./accounts";
import { PortalError } from "./portal-policy";
import {
  socialError,
  socialHeaders,
  socialWriteInput
} from "./social-boundary";
import {
  readMeasurementChoice,
  recordMetricForeground,
  saveMeasurementChoice,
  recordOnboardingPresentation
} from "./platform-measurement";

export async function handleMeasurementRequest(
  db: PrismaClient,
  request: Request
) {
  try {
    const token = requestSessionToken(request),
      owner = request.headers.get("x-expected-account");
    if (new URL(request.url).search || !owner)
      throw new PortalError(
        400,
        "Reload this account's measurement choices before continuing."
      );
    if ((await readAccountSession(db, token))?.id !== owner)
      throw new PortalError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    if (request.method === "GET")
      return Response.json(await readMeasurementChoice(db, token), {
        headers: socialHeaders
      });
    const { input } = await socialWriteInput(
      db,
      request,
      "platform-measurement"
    );
    const result =
      input.operation === "choice"
        ? await saveMeasurementChoice(db, token, input)
        : input.operation === "onboarding-start"
          ? await recordOnboardingPresentation(db, token, input)
          : await recordMetricForeground(db, token, input);
    return Response.json(result, { headers: socialHeaders });
  } catch (error) {
    const response = socialError(error);
    for (const [key, value] of Object.entries(socialHeaders))
      response.headers.set(key, value);
    return response;
  }
}
