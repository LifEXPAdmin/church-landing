import { createHmac, timingSafeEqual } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { accountConfig } from "./account-config";
import { apiCursor, wire, type WireSchema } from "./api-contracts";

export class NativeCursorError extends Error {
  constructor() {
    super("Reopen this reading list from its first page.");
  }
}
export const NATIVE_CURSOR_LIFETIME_MS = 60 * 60 * 1000;

/** The signature binds endpoint, original viewer, target and normalized filters.
 * Continuations keep their original deadline; no raw IDs or dates are accepted.
 * A signature is integrity protection, not permission or a content snapshot.
 */
export function nativeReadCursors<T>(
  binding: readonly (string | null)[],
  payload: WireSchema<T>,
  now = new Date()
) {
  const signature = (body: string) =>
    createHmac("sha256", accountConfig().rateSecret)
      .update(JSON.stringify(["native-read:v1", ...binding, body]))
      .digest();
  const envelope = wire.object({ expires: wire.integer(), value: payload });
  return {
    encode(value: T, expires = now.getTime() + NATIVE_CURSOR_LIFETIME_MS) {
      const body = gzipSync(
        JSON.stringify(envelope.parse({ expires, value }))
      ).toString("base64url");
      try {
        return apiCursor.parse(
          body + "." + signature(body).toString("base64url")
        );
      } catch {
        throw new Error("Native cursor exceeds the response bound");
      }
    },
    decode(value: string | null) {
      if (value === null) return null;
      try {
        apiCursor.parse(value);
        const parts = value.split(".");
        if (parts.length !== 2) throw new NativeCursorError();
        const [body, signed] = parts;
        const expected = signature(body);
        const actual = Buffer.from(signed, "base64url");
        if (
          actual.length !== expected.length ||
          !timingSafeEqual(actual, expected) ||
          actual.toString("base64url") !== signed
        )
          throw new NativeCursorError();
        const result = envelope.parse(
          JSON.parse(
            gunzipSync(Buffer.from(body, "base64url"), {
              maxOutputLength: 8192
            }).toString("utf8")
          )
        );
        if (
          result.expires <= now.getTime() ||
          result.expires > now.getTime() + NATIVE_CURSOR_LIFETIME_MS
        )
          throw new NativeCursorError();
        return result;
      } catch {
        throw new NativeCursorError();
      }
    }
  };
}
