import { put, get, del } from "@vercel/blob";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { PortalError } from "./portal-policy";
import { IMAGE_VARIANT_BYTES } from "./media-processing";

export interface ImageStorage {
  put(path: string, bytes: Buffer, signal: AbortSignal): Promise<void>;
  get(path: string, signal: AbortSignal): Promise<Buffer | null>;
  delete(paths: string[], signal: AbortSignal): Promise<void>;
}
function key(path: string) {
  if (
    !/^images\/[a-f0-9-]{36}\/(original|large|medium|thumb)\.webp$/.test(path)
  )
    throw new Error("Invalid internal image key");
  return path;
}
export async function boundedBytes(
  stream: ReadableStream<Uint8Array>,
  maximum: number,
  signal: AbortSignal
) {
  const reader = stream.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    signal.throwIfAborted();
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      length += value.byteLength;
      if (length > maximum)
        throw new PortalError(413, "The image is too large.");
      chunks.push(value);
    }
    return Buffer.concat(chunks, length);
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export function imagesAvailable() {
  try {
    imageStorage();
    return true;
  } catch {
    return false;
  }
}
export function imageStorage(): ImageStorage {
  if (process.env.MEDIA_STORAGE_MODE === "private-blob")
    return privateImageStorage();
  if (
    process.env.MEDIA_STORAGE_MODE === "local-test" &&
    process.env.ACCOUNT_TEST_ISOLATED === "1" &&
    !process.env.VERCEL
  ) {
    const db = new URL(process.env.DATABASE_URL ?? "invalid:");
    const root = resolve(process.env.MEDIA_TEST_DIR ?? "");
    if (
      db.hostname !== "127.0.0.1" ||
      db.pathname !== "/godschurches_security_test" ||
      !root.startsWith(resolve(".account-test") + sep)
    )
      throw new Error("Isolated image storage required");
    return {
      async put(path, bytes, signal) {
        const file = resolve(root, key(path));
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, bytes, { flag: "wx", mode: 0o600, signal });
      },
      async get(path, signal) {
        try {
          return await readFile(resolve(root, key(path)), { signal });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
          throw error;
        }
      },
      async delete(paths, signal) {
        for (const path of paths) {
          signal.throwIfAborted();
          await rm(resolve(root, key(path)), { force: true });
        }
      }
    };
  }
  throw new PortalError(
    503,
    "Image uploads are not available yet. Your existing images are unchanged."
  );
}

// Maintenance remains available while public uploads are disabled, including
// during activation checks and a later operational shutdown of uploads.
export function privateImageStorage(): ImageStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
    return {
      async put(path, bytes, signal) {
        await put(key(path), bytes, {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: false,
          contentType: "image/webp",
          abortSignal: signal
        });
      },
      async get(path, signal) {
        const result = await get(key(path), {
          access: "private",
          useCache: false,
          abortSignal: signal
        });
        if (!result || result.statusCode !== 200) return null;
        return boundedBytes(result.stream, IMAGE_VARIANT_BYTES, signal);
      },
      async delete(paths, signal) {
        await del(paths.map(key), { abortSignal: signal });
      }
    };
  throw new Error("Private image storage is not configured");
}
