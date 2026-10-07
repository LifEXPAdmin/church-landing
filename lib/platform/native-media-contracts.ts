/** Native image descriptors and commands. No server, DOM or provider imports. */
import {
  API_VERSION,
  apiId,
  wire,
  WireContractError,
  type WireValue,
  type WireSchema
} from "./api-contracts";

export const NATIVE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const NATIVE_IMAGE_DETAILS_MAX = 8192;
export const nativeImagePurpose = wire.oneOf([
  "PROFILE_AVATAR",
  "PROFILE_COVER",
  "CHURCH_LOGO",
  "CHURCH_COVER",
  "POST_PHOTO",
  "EXCHANGE_PHOTO"
]);
export const nativeImageVariant = wire.oneOf([
  "original",
  "large",
  "medium",
  "thumb"
]);
const version = wire.integer(Number.MAX_SAFE_INTEGER - 1);
const fraction = (min: number, max: number) =>
  wire.schema<number>((value) => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new WireContractError();
    return value;
  });
const crop = wire.nullable(
  wire.object({ x: fraction(0, 1), y: fraction(0, 1), zoom: fraction(1, 4) })
);
const upload = wire.object({
  purpose: nativeImagePurpose,
  targetId: apiId,
  requestKey: wire.text(
    36,
    36,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
  ),
  replacesId: wire.nullable(apiId),
  expectedVersion: wire.nullable(version),
  caption: wire.text(500),
  alt: wire.text(300),
  crop
});
export const nativeImageUpload = wire.schema((value, mode) => {
  const result = upload.parse(value, mode);
  if ((result.replacesId === null) !== (result.expectedVersion === null))
    throw new WireContractError();
  if (
    ["POST_PHOTO", "EXCHANGE_PHOTO"].includes(result.purpose) &&
    result.crop !== null
  )
    throw new WireContractError();
  return result;
});
export const nativeImageListInput = wire.object({
  purpose: nativeImagePurpose,
  targetId: apiId
});
export const nativeImageRemoveInput = wire.object({
  id: apiId,
  expectedVersion: version
});
const dimension = wire.schema<number>((value) => {
  const result = wire.integer(16384).parse(value);
  if (!result) throw new WireContractError();
  return result;
});
const variant = wire.object({
  width: dimension,
  height: dimension,
  bytes: wire.integer(NATIVE_IMAGE_MAX_BYTES),
  path: wire.text(
    180,
    1,
    /^\/api\/platform\/v1\/images\/[A-Za-z0-9_-]+\/(original|large|medium|thumb)$/
  )
});
export const nativeImage = wire.object({
  id: apiId,
  version,
  purpose: nativeImagePurpose,
  caption: wire.text(500),
  alt: wire.text(300),
  position: wire.integer(1000),
  crop,
  variants: wire.object({
    original: variant,
    large: variant,
    medium: variant,
    thumb: variant
  })
});
export const nativeImageResults = {
  list: wire.object({ images: wire.array(nativeImage, 10) }),
  upload: wire.object({ image: nativeImage }),
  remove: wire.object({ removed: wire.literal(true) })
};
export type NativeImageOperation = keyof typeof nativeImageResults;
export type NativeImage = WireValue<typeof nativeImage>;
export function nativeImageEnvelope<K extends NativeImageOperation>(
  operation: K
) {
  return wire.object({
    apiVersion: wire.literal(API_VERSION),
    viewerId: apiId,
    data: nativeImageResults[operation]
  }) as WireSchema<{
    apiVersion: typeof API_VERSION;
    viewerId: string;
    data: WireValue<(typeof nativeImageResults)[K]>;
  }>;
}
