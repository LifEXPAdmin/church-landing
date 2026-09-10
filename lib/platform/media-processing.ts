import sharp from "sharp";
import { PortalError } from "./portal";

// One binary request stays below the hosting platform's 4.5 MB payload limit.
export const IMAGE_INPUT_BYTES = 4 * 1024 * 1024;
export const IMAGE_VARIANT_BYTES = 4 * 1024 * 1024;
export const IMAGE_OUTPUT_BYTES = 12 * 1024 * 1024;
export const IMAGE_PIXELS = 40_000_000;
export const IMAGE_VARIANTS = ["original", "large", "medium", "thumb"] as const;
export type ImageVariant = (typeof IMAGE_VARIANTS)[number];
export type ImageDimensions = { width: number; height: number; bytes: number };
export type ImageManifest = Record<ImageVariant, ImageDimensions>;
export type ProcessedImage = {
  manifest: ImageManifest;
  files: Record<ImageVariant, Buffer>;
};
export function imageVariant(value: unknown): ImageVariant {
  if (!IMAGE_VARIANTS.includes(value as ImageVariant))
    throw new PortalError(404, "Image unavailable.");
  return value as ImageVariant;
}
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (!input.length || input.length > IMAGE_INPUT_BYTES)
    throw new PortalError(413, "Choose an image no larger than 4 MiB.");
  const jpeg = input[0] === 0xff && input[1] === 0xd8 && input[2] === 0xff;
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp =
    input.toString("ascii", 0, 4) === "RIFF" &&
    input.toString("ascii", 8, 12) === "WEBP";
  if (!jpeg && !png && !webp)
    throw new PortalError(400, "Choose a JPEG, PNG or WebP image.");
  try {
    // libvips may read only APNG's fallback still frame; reject its animation
    // control chunk explicitly rather than accepting a misleading first frame.
    if (png) {
      for (let offset = 8; offset + 12 <= input.length; ) {
        const length = input.readUInt32BE(offset);
        if (length > input.length - offset - 12)
          throw new Error("Invalid PNG chunk");
        if (input.toString("ascii", offset + 4, offset + 8) === "acTL")
          throw new Error("Animated PNG");
        offset += length + 12;
      }
    }
    const options = {
      failOn: "warning" as const,
      limitInputPixels: IMAGE_PIXELS,
      sequentialRead: true
    };
    const metadata = await sharp(input, options).metadata();
    if (
      !metadata.width ||
      !metadata.height ||
      metadata.width > 16384 ||
      metadata.height > 16384 ||
      metadata.width * metadata.height > IMAGE_PIXELS ||
      (metadata.pages ?? 1) !== 1 ||
      !["jpeg", "png", "webp"].includes(metadata.format ?? "")
    )
      throw new Error("Unsupported dimensions or animation");
    // Re-encoding strips EXIF/GPS, XMP, ICC, comments and appended payloads.
    // 'original' means the normalized full-resolution image, never the raw file.
    const original = await sharp(input, options)
      .autoOrient()
      .toColourspace("srgb")
      .webp({ quality: 88, effort: 3 })
      .timeout({ seconds: 8 })
      .toBuffer({ resolveWithObject: true });
    if (original.data.length > IMAGE_VARIANT_BYTES)
      throw new PortalError(
        413,
        "The processed image is too large. Choose a smaller photo; your existing image is unchanged."
      );
    const files = { original: original.data } as ProcessedImage["files"];
    const manifest = {
      original: {
        width: original.info.width,
        height: original.info.height,
        bytes: original.data.length
      }
    } as ImageManifest;
    let total = original.data.length;
    for (const [variant, size] of [
      ["large", 1600],
      ["medium", 800],
      ["thumb", 240]
    ] as const) {
      const output = await sharp(original.data, options)
        .resize(size, size, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80, effort: 3 })
        .timeout({ seconds: 4 })
        .toBuffer({ resolveWithObject: true });
      total += output.data.length;
      if (
        output.data.length > IMAGE_VARIANT_BYTES ||
        total > IMAGE_OUTPUT_BYTES
      )
        throw new Error("Output too large");
      files[variant] = output.data;
      manifest[variant] = {
        width: output.info.width,
        height: output.info.height,
        bytes: output.data.length
      };
    }
    return { files, manifest };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError(
      400,
      "This image could not be processed. Use one still JPEG, PNG or WebP up to 40 megapixels; your existing image is unchanged."
    );
  }
}
