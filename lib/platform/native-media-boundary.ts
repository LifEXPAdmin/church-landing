import type { PrismaClient } from "@prisma/client";
import {
  API_VERSION,
  apiFailure,
  apiErrorRules,
  apiId,
  WireContractError,
  type ApiErrorCode
} from "./api-contracts";
import { AccountError } from "./account-error";
import { AccountSessionOwnerError } from "./account-sessions";
import { accountConfig } from "./account-config";
import { readBody } from "./account-boundary";
import { allowImageAttempt } from "./account-limits";
import { PortalError } from "./portal-policy";
import { PrivilegedAuthenticationError } from "./privileged-auth-policy";
import {
  nativeRequestCredential,
  NativeRequestError,
  nativeAuthHeaders
} from "./native-session-boundary";
import { readNativeSession } from "./native-session";
import {
  listImages,
  uploadImage,
  readImage,
  removeImage,
  type ImageView
} from "./media";
import { boundedBytes, type ImageStorage } from "./media-storage";
import {
  NATIVE_IMAGE_MAX_BYTES,
  NATIVE_IMAGE_DETAILS_MAX,
  nativeImageListInput,
  nativeImageUpload,
  nativeImageRemoveInput,
  nativeImageVariant,
  nativeImageEnvelope,
  type NativeImageOperation
} from "./native-media-contracts";

const headers = {
  ...nativeAuthHeaders,
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Robots-Tag": "noindex, nofollow"
};
function failure(
  code: ApiErrorCode,
  message: string,
  retry: number | null = null
) {
  return Response.json(
    apiFailure.parse({
      apiVersion: API_VERSION,
      error: { code, message, retryAfterSeconds: retry }
    }),
    {
      status: apiErrorRules[code].status,
      headers: {
        ...headers,
        ...(retry ? { "Retry-After": String(retry) } : {})
      }
    }
  );
}
function denied(error: unknown) {
  if (error instanceof AccountSessionOwnerError)
    return failure(
      "account_changed",
      "Return to the original signed-in account before continuing."
    );
  if (error instanceof AccountError)
    return error.code === "session" || error.code === "credentials"
      ? failure("unauthenticated", "Sign in again to manage images.")
      : failure("validation", "Check the image details and try again.");
  if (error instanceof NativeRequestError)
    return failure(error.code, "Use the supported native image controls.");
  if (
    error instanceof WireContractError ||
    error instanceof SyntaxError ||
    error instanceof URIError
  )
    return failure("validation", "Check the image details and try again.");
  if (error instanceof PrivilegedAuthenticationError)
    return failure("authenticator_required", error.message);
  if (error instanceof PortalError) {
    const code: ApiErrorCode =
      error.status === 401
        ? "unauthenticated"
        : error.status === 403
          ? "forbidden"
          : error.status === 404
            ? "not_found"
            : error.status === 409
              ? "conflict"
              : error.status === 429
                ? "rate_limited"
                : error.status === 503
                  ? "feature_unavailable"
                  : "validation";
    return failure(
      code,
      error.message,
      code === "rate_limited"
        ? Math.min(86400, Math.max(1, error.retryAfter ?? 900))
        : null
    );
  }
  return failure(
    "unconfirmed",
    "The image result could not be confirmed. Reconnect and retry with the same image and request reference."
  );
}
function project(image: ImageView) {
  return {
    id: image.id,
    version: image.version,
    purpose: image.purpose,
    caption: image.caption,
    alt: image.alt,
    position: image.position,
    crop: image.crop,
    variants: Object.fromEntries(
      ["original", "large", "medium", "thumb"].map((name) => {
        const v = image.variants[name];
        return [
          name,
          {
            width: v.width,
            height: v.height,
            bytes: v.bytes,
            path: `/api/platform/v1/images/${image.id}/${name}`
          }
        ];
      })
    )
  };
}
function success(
  operation: NativeImageOperation,
  viewerId: string,
  data: unknown
) {
  try {
    return Response.json(
      nativeImageEnvelope(operation).parse({
        apiVersion: API_VERSION,
        viewerId,
        data
      }),
      { headers }
    );
  } catch {
    throw new Error("Native image projection failed");
  }
}
/** Binary image transport; canonical services retain all authorization and lifecycle decisions. */
export async function handleNativeImageRequest(
  db: PrismaClient,
  request: Request,
  delivery?: { id: string; variant: string },
  store?: ImageStorage
) {
  try {
    const methods = delivery ? ["GET"] : ["GET", "POST", "DELETE"];
    if (!methods.includes(request.method)) {
      const response = failure(
        "method_not_allowed",
        "Use the supported image request method."
      );
      response.headers.set("Allow", methods.join(", "));
      return response;
    }
    if (request.url.length > 8192) throw new NativeRequestError("validation");
    const credential = nativeRequestCredential(
      request,
      !delivery && request.method === "GET" ? ["purpose", "targetId"] : []
    );
    if (!credential.token) throw new NativeRequestError("unauthenticated");
    if (!credential.owner) throw new NativeRequestError("validation");
    const { token, owner } = credential;
    const identity = { expectedOwner: owner, credentialSupplied: true };
    if (request.method === "GET") {
      if (
        request.body ||
        (request.headers.has("content-length") &&
          request.headers.get("content-length") !== "0")
      )
        throw new NativeRequestError("validation");
      if (delivery) {
        const bytes = await readImage(
          db,
          token,
          apiId.parse(delivery.id),
          nativeImageVariant.parse(delivery.variant),
          store,
          AbortSignal.any([request.signal, AbortSignal.timeout(15000)]),
          identity
        );
        return new Response(new Uint8Array(bytes), {
          headers: {
            ...headers,
            "Content-Type": "image/webp",
            "Content-Length": String(bytes.length),
            "Content-Disposition": 'inline; filename="image.webp"'
          }
        });
      }
      const input = nativeImageListInput.parse(
        Object.fromEntries(new URL(request.url).searchParams)
      );
      const images = await listImages(
        db,
        token,
        input.purpose,
        input.targetId,
        identity
      );
      return success("list", owner, { images: images.map(project) });
    }
    // Authenticate and spend the existing image budget before consuming any body.
    await readNativeSession(db, token, owner);
    const config = accountConfig();
    const ip = process.env.VERCEL
      ? (request.headers.get("x-real-ip") ?? "unknown").slice(0, 64)
      : "local";
    if (
      !(await allowImageAttempt(
        db,
        config.rateSecret,
        request.method === "POST" ? "upload" : "remove",
        ip,
        owner
      ))
    )
      throw new PortalError(
        429,
        "Too many image changes. Wait 15 minutes and try again.",
        900
      );
    if (request.method === "DELETE") {
      if (request.headers.get("content-type") !== "application/json")
        throw new NativeRequestError("validation");
      const input = nativeImageRemoveInput.parse(await readBody(request, 2048));
      return success(
        "remove",
        owner,
        await removeImage(db, token, input.id, input.expectedVersion, owner)
      );
    }
    if (
      ![
        "application/octet-stream",
        "image/jpeg",
        "image/png",
        "image/webp"
      ].includes(request.headers.get("content-type") ?? "")
    )
      throw new NativeRequestError("validation");
    const raw = request.headers.get("x-image-details");
    if (!raw || raw.length > NATIVE_IMAGE_DETAILS_MAX)
      throw new NativeRequestError("validation");
    const input = nativeImageUpload.parse(JSON.parse(decodeURIComponent(raw)));
    const length = request.headers.get("content-length");
    if (
      length !== null &&
      (!/^\d+$/.test(length) || Number(length) > NATIVE_IMAGE_MAX_BYTES)
    )
      throw new PortalError(413, "Choose an image no larger than 4 MiB.");
    if (!request.body) throw new PortalError(400, "Choose an image.");
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(45000)
    ]);
    const bytes = await boundedBytes(
      request.body,
      NATIVE_IMAGE_MAX_BYTES,
      signal
    );
    const image = await uploadImage(
      db,
      token,
      {
        purpose: input.purpose,
        targetId: input.targetId,
        requestKey: input.requestKey,
        replacesId: input.replacesId,
        expectedVersion: input.expectedVersion ?? undefined,
        caption: input.caption,
        alt: input.alt,
        crop: input.crop ?? undefined
      },
      bytes,
      store,
      signal,
      owner
    );
    return success("upload", owner, { image: project(image) });
  } catch (error) {
    return denied(error);
  }
}
