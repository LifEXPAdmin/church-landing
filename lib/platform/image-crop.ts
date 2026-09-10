export type ImageCrop = { x: number; y: number; zoom: number };
export const centeredCrop: ImageCrop = { x: 0.5, y: 0.5, zoom: 1 };
export function validImageCrop(value: unknown): value is ImageCrop {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    Object.keys(v).length === 3 &&
    ["x", "y", "zoom"].every(
      (k) => typeof v[k] === "number" && Number.isFinite(v[k])
    ) &&
    Number(v.x) >= 0 &&
    Number(v.x) <= 1 &&
    Number(v.y) >= 0 &&
    Number(v.y) <= 1 &&
    Number(v.zoom) >= 1 &&
    Number(v.zoom) <= 4
  );
}
export function imageCropRect(
  width: number,
  height: number,
  aspect: number,
  crop: ImageCrop
) {
  const cropWidth = Math.max(
    1,
    Math.min(width, Math.round(Math.min(width, height * aspect) / crop.zoom))
  );
  const cropHeight = Math.max(
    1,
    Math.min(height, Math.round(cropWidth / aspect))
  );
  return {
    width: cropWidth,
    height: cropHeight,
    left: Math.round((width - cropWidth) * crop.x),
    top: Math.round((height - cropHeight) * crop.y)
  };
}
export function imageAspect(purpose: string) {
  return purpose.endsWith("_AVATAR") || purpose.endsWith("_LOGO")
    ? 1
    : purpose.endsWith("_COVER")
      ? 3
      : null;
}
