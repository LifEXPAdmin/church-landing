import {
  API_VERSION,
  apiDate,
  apiId,
  wire,
  WireContractError,
  type WireSchema,
  type WireValue
} from "./api-contracts";
import { parseDestinationPath } from "./destinations";

/** Opaque Expo routing tokens are credentials, never display or diagnostic data. */
export function isExpoPushToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,256}\]$/.test(value)
  );
}

const uuid = wire.text(
  36,
  36,
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
);
const secret = wire.text(43, 43, /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
const generation = wire.integer(2147483647);
const version = wire.schema((value) => {
  const parsed = generation.parse(value);
  if (!parsed) throw new WireContractError();
  return parsed;
});
const label = wire.schema((value) => {
  const parsed = wire.text(80, 1).parse(value);
  if (parsed !== parsed.trim() || /[\u0000-\u001f\u007f]/.test(parsed))
    throw new WireContractError();
  return parsed;
});
const expoToken = wire.schema((value) => {
  if (!isExpoPushToken(value)) throw new WireContractError();
  return value;
});
export const nativePushPrepareInput = wire.object({
  installationSecret: secret
});
export const nativePushRegisterInput = wire.object({
  id: uuid,
  mutationId: uuid,
  installationSecret: secret,
  expectedInstallationVersion: wire.integer(2147483645),
  recoveryEpoch: uuid,
  provider: wire.literal("EXPO"),
  platform: wire.oneOf(["IOS", "ANDROID"]),
  token: expoToken,
  label
});
export const nativePushRevokeInput = wire.object({
  id: apiId,
  mutationId: uuid,
  expectedVersion: version
});
export const nativePushOpenInput = wire.object({ deliveryId: apiId });
export type NativePushRegistration = WireValue<typeof nativePushRegisterInput>;
export type NativePushRevocation = WireValue<typeof nativePushRevokeInput>;
const descriptor = wire.object({
  id: apiId,
  version,
  provider: wire.oneOf(["WEB_PUSH", "EXPO"]),
  platform: wire.nullable(wire.oneOf(["IOS", "ANDROID"])),
  label,
  createdAt: apiDate,
  expiresAt: apiDate,
  isCurrentSession: wire.boolean
});
export const nativePushDevice = wire.schema((value, mode) => {
  const parsed = descriptor.parse(value, mode);
  if ((parsed.provider === "WEB_PUSH") !== (parsed.platform === null))
    throw new WireContractError();
  return parsed;
});
export const nativePushPrepared = wire.object({
  recoveryEpoch: uuid,
  installationVersion: generation,
  available: wire.boolean,
  projectId: wire.nullable(
    wire.text(
      36,
      36,
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
    )
  ),
  association: wire.nullable(nativePushDevice)
});
export const nativePushRegistered = wire.object({
  id: uuid,
  version,
  installationVersion: version,
  recoveryEpoch: uuid,
  message: wire.text(1000, 1)
});
export const nativePushRevoked = wire.object({
  id: apiId,
  version,
  removed: wire.literal(true),
  message: wire.text(1000, 1)
});
export const nativePushDevices = wire.object({
  devices: wire.array(nativePushDevice, 8)
});
export function nativePushRequiresWeb(href: string) {
  const destination = parseDestinationPath(href);
  return (
    !destination || !["post", "church", "profile"].includes(destination.kind)
  );
}
const opened = wire.object({
  href: wire.text(2048, 1, /^\/platform(?:\/[A-Za-z0-9_/?=&#%.-]*)?$/),
  preview: wire.literal("You have new activity on God’s Churches."),
  tag: wire.text(64, 64, /^[a-f0-9]+$/),
  requiresWeb: wire.boolean
});
export const nativePushOpened = wire.schema((value, mode) => {
  const parsed = opened.parse(value, mode);
  if (parsed.requiresWeb !== nativePushRequiresWeb(parsed.href))
    throw new WireContractError();
  return parsed;
});
const results = {
  prepare: nativePushPrepared,
  register: nativePushRegistered,
  revoke: nativePushRevoked,
  list: nativePushDevices,
  open: nativePushOpened
};
export type NativePushOperation = keyof typeof results;
function response<K extends NativePushOperation>(
  operation: K,
  value: unknown,
  mode: "reject" | "strip"
) {
  const schema: WireSchema<unknown> = results[operation];
  return wire
    .object({
      apiVersion: wire.literal(API_VERSION),
      viewerId: apiId,
      data: schema
    })
    .parse(value, mode) as {
    apiVersion: typeof API_VERSION;
    viewerId: string;
    data: WireValue<(typeof results)[K]>;
  };
}
export function encodeNativePushResponse<K extends NativePushOperation>(
  operation: K,
  value: unknown
) {
  return response(operation, value, "reject");
}
/** Keep original request bytes and the initiating credential generation across await. */
export function decodeNativePushResponse<K extends NativePushOperation>(
  operation: K,
  value: unknown,
  expectedOwner: string
) {
  const parsed = response(operation, value, "strip");
  if (parsed.viewerId !== apiId.parse(expectedOwner))
    throw new WireContractError();
  return parsed;
}
export function decodeNativePushRegistration(
  value: unknown,
  owner: string,
  input: NativePushRegistration
) {
  nativePushRegisterInput.parse(input);
  const result = decodeNativePushResponse("register", value, owner);
  if (
    result.data.id !== input.id ||
    result.data.version !== 1 ||
    result.data.installationVersion !== input.expectedInstallationVersion + 1 ||
    result.data.recoveryEpoch !== input.recoveryEpoch
  )
    throw new WireContractError();
  return result;
}
export function decodeNativePushRevocation(
  value: unknown,
  owner: string,
  input: NativePushRevocation
) {
  nativePushRevokeInput.parse(input);
  const result = decodeNativePushResponse("revoke", value, owner);
  if (
    result.data.id !== input.id ||
    result.data.version !== input.expectedVersion + 1
  )
    throw new WireContractError();
  return result;
}
