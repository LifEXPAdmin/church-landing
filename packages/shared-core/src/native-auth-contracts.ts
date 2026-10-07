/** Native v1 transport contracts. This module has no server or browser imports. */
import {
  API_VERSION,
  apiDate,
  apiId,
  apiSession,
  wire,
  WireContractError,
  type WireSchema,
  type WireValue
} from "./api-contracts";

const version = wire.integer(Number.MAX_SAFE_INTEGER - 1);
const password = wire.text(128, 8);
const mutation = {
  requestKey: wire.text(
    36,
    36,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
  ),
  expectedVersion: version
};
const code = wire.text(6, 6, /^[0-9]{6}$/);
export const nativePrivilegedPurpose = wire.oneOf([
  "privileged-work",
  "change-access",
  "export-metrics",
  "redact-support",
  "send-announcement"
]);
export const nativePasswordInput = wire.object({
  email: wire.text(254, 1),
  password
});
export const nativeActivityInput = wire.object({
  activity: wire.literal("foreground")
});
export const nativeEmptyInput = wire.object({});
export const nativeActivity = wire.object({
  owner: apiId,
  legacy: wire.boolean,
  deadline: apiDate,
  absoluteExpiresAt: apiDate,
  serverTime: apiDate
});
const passwordResult = wire.object({
  tokenType: wire.literal("Bearer"),
  token: wire.text(43, 43, /^[A-Za-z0-9_-]+$/),
  session: apiSession,
  activity: nativeActivity
});
export const nativePasswordResult = wire.schema((value, mode) => {
  const result = passwordResult.parse(value, mode);
  if (
    result.session.state !== "authenticated" ||
    result.session.account.id !== result.activity.owner
  )
    throw new WireContractError();
  return result;
});
export const nativeLogoutResult = wire.object({
  ownerId: apiId,
  signedOut: wire.literal(true)
});
export const nativeAuthenticatorInput = wire.union(
  wire.union(
    wire.object({
      operation: wire.literal("mfa-start"),
      ...mutation,
      currentPassword: password
    }),
    wire.object({ operation: wire.literal("mfa-confirm"), ...mutation, code })
  ),
  wire.union(
    wire.object({
      operation: wire.literal("mfa-challenge"),
      ...mutation,
      code,
      purpose: nativePrivilegedPurpose
    }),
    wire.union(
      wire.object({
        operation: wire.literal("mfa-replace"),
        ...mutation,
        currentPassword: password,
        code
      }),
      wire.object({
        operation: wire.literal("mfa-recover"),
        ...mutation,
        currentPassword: password,
        recoveryCode: wire.text(23, 20, /^[a-fA-F0-9-]+$/)
      })
    )
  )
);
export const nativeAuthenticatorState = wire.object({
  ownerId: apiId,
  eligible: wire.boolean,
  hasDuties: wire.boolean,
  mode: wire.oneOf(["off", "enroll", "enforce"]),
  available: wire.boolean,
  // Native provider confirmation is unavailable until its own secure exchange exists.
  googleRecentAuthentication: wire.literal(false),
  factor: wire.nullable(
    wire.object({
      version,
      confirmed: wire.boolean,
      quarantined: wire.boolean,
      recoveryCodesRemaining: wire.integer(8),
      expiresAt: wire.nullable(apiDate)
    })
  ),
  confirmedForWork: wire.boolean,
  notices: wire.array(
    wire.object({
      id: apiId,
      action: wire.text(80, 1),
      createdAt: apiDate,
      deliveredAt: wire.nullable(apiDate)
    }),
    10
  )
});
export const nativeAuthenticatorResult = wire.object({
  version,
  message: wire.text(1000, 1),
  enrollment: wire.nullable(
    wire.object({
      secret: wire.text(64, 16, /^[A-Z2-7]+$/),
      expiresAt: apiDate
    })
  ),
  recoveryCodes: wire.nullable(
    wire.array(wire.text(23, 23, /^[a-f0-9]{5}(?:-[a-f0-9]{5}){3}$/), 8)
  )
});
export const nativeEnvelope = <T>(data: WireSchema<T>) =>
  wire.object({
    apiVersion: wire.literal(API_VERSION),
    viewerId: wire.nullable(apiId),
    data
  });
export type NativeAuthenticatorInput = WireValue<
  typeof nativeAuthenticatorInput
>;

export const nativeResponseSchemas = Object.freeze({
  password: nativePasswordResult,
  session: apiSession,
  activity: nativeActivity,
  logout: nativeLogoutResult,
  authenticator: nativeAuthenticatorState,
  authenticatorCommand: nativeAuthenticatorResult
});
export type NativeResponseOperation = keyof typeof nativeResponseSchemas;
type NativeResponse<K extends NativeResponseOperation> = {
  apiVersion: typeof API_VERSION;
  viewerId: string | null;
  data: WireValue<(typeof nativeResponseSchemas)[K]>;
};
function parseNativeResponse<K extends NativeResponseOperation>(
  operation: K,
  value: unknown,
  mode: "reject" | "strip"
) {
  const schema: WireSchema<unknown> = nativeResponseSchemas[operation];
  const result = nativeEnvelope(schema).parse(value, mode);
  const data = result.data as Record<string, unknown>;
  const owner =
    operation === "password"
      ? (data.activity as { owner: string }).owner
      : operation === "session"
        ? ((data.account as { id: string } | null)?.id ?? null)
        : operation === "activity"
          ? data.owner
          : operation === "authenticatorCommand"
            ? result.viewerId
            : data.ownerId;
  if (
    result.viewerId !== owner ||
    (operation !== "session" && result.viewerId === null)
  )
    throw new WireContractError();
  return result as NativeResponse<K>;
}
export function encodeNativeResponse<K extends NativeResponseOperation>(
  operation: K,
  value: unknown
) {
  return parseNativeResponse(operation, value, "reject");
}
/** Retain the expected account AND local credential generation across the await. */
export function decodeNativeResponse<
  K extends Exclude<NativeResponseOperation, "password" | "session">
>(operation: K, value: unknown, expectedViewerId: string) {
  apiId.parse(expectedViewerId);
  const result = parseNativeResponse(operation, value, "strip");
  if (result.viewerId !== expectedViewerId) throw new WireContractError();
  return result;
}
/** Initial issuance only. Consumers must still match the initiating sign-in generation. */
export const decodeNativePasswordResponse = (value: unknown) =>
  parseNativeResponse("password", value, "strip");
