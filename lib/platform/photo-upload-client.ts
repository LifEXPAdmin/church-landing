import type { ImageView } from "./media";
import { currentSocialOwner, SocialClientError } from "./social-client";

/** A retry repeats the caller's immutable details string and the same File. */
export function uploadPhotoFile(
  file: File,
  details: string,
  ownerId: string,
  progress: (percent: number | null) => void
) {
  let xhr: XMLHttpRequest | null = null,
    canceled = false;
  const promise = (async () => {
    if ((await currentSocialOwner()) !== ownerId)
      throw new SocialClientError(
        401,
        "Your sign-in changed. Reload before uploading."
      );
    if (canceled)
      throw new SocialClientError(0, "Upload stopped before it started.");
    const image = await new Promise<ImageView>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/platform/images");
      xhr.timeout = 60_000;
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.setRequestHeader("X-Image-Details", encodeURIComponent(details));
      xhr.setRequestHeader("X-Expected-Account", ownerId);
      xhr.upload.onprogress = (event) =>
        progress(
          event.lengthComputable
            ? Math.floor((event.loaded / event.total) * 100)
            : null
        );
      xhr.onload = () => {
        try {
          const value = JSON.parse(xhr!.responseText);
          if (xhr!.status < 200 || xhr!.status >= 300)
            throw new SocialClientError(
              xhr!.status,
              value.message ??
                "Upload was not confirmed. Keep this file and retry."
            );
          if (!value.id || !value.variants)
            throw new SocialClientError(
              0,
              "The save reply was incomplete. Retry the same file to check it."
            );
          resolve(value);
        } catch (error) {
          reject(error);
        }
      };
      xhr.onerror = xhr.ontimeout = () =>
        reject(
          new SocialClientError(
            0,
            "Connection interrupted. Retry this file to check whether it was saved."
          )
        );
      xhr.onabort = () =>
        reject(
          new SocialClientError(
            0,
            "Upload stopped. Retry the same file to check whether it was saved."
          )
        );
      try {
        xhr.send(file);
      } catch {
        reject(
          new SocialClientError(0, "Upload could not start. Retry this file.")
        );
      }
    });
    if ((await currentSocialOwner()) !== ownerId)
      throw new SocialClientError(
        401,
        "Your sign-in changed. Reload before continuing."
      );
    return image;
  })();
  return {
    promise,
    abort() {
      canceled = true;
      xhr?.abort();
    }
  };
}
