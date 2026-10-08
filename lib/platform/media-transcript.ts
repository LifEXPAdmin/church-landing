import { PortalError } from "./portal-policy";

export const MEDIA_TRANSCRIPT_MAX_CHARS = 60000;
export const MEDIA_CHAPTER_MAX_COUNT = 100;
export const MEDIA_COMMAND_MAX_BYTES = 524288;
export type MediaChapter = { startSeconds: number; title: string };

function plainText(
  value: unknown,
  maximum: number,
  label: string,
  required = false
) {
  if (value === undefined || value === null) value = "";
  if (
    typeof value !== "string" ||
    !value.isWellFormed() ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new PortalError(400, `Use plain valid text for ${label}.`);
  const text = value.replace(/\r\n?/g, "\n").trim();
  if (text.length > maximum || (required && !text))
    throw new PortalError(
      400,
      `Check ${label}; ${required ? "a value is required, with " : "use "}at most ${maximum} characters.`
    );
  return text;
}

/** Publisher-supplied text and timestamps only; no remote source or playback work. */
export function mediaTranscript(
  value: unknown,
  input: unknown,
  durationSeconds: number | null = null
): { transcriptText: string; chapters: MediaChapter[] } {
  const transcriptText = plainText(
    value,
    MEDIA_TRANSCRIPT_MAX_CHARS,
    "transcript"
  );
  if (
    durationSeconds !== null &&
    (!Number.isSafeInteger(durationSeconds) ||
      durationSeconds < 1 ||
      durationSeconds > 604800)
  )
    throw new PortalError(
      400,
      "Use a whole duration in seconds from 1 to 604800, or leave it unknown."
    );
  const values = input === undefined ? [] : input;
  if (!Array.isArray(values) || values.length > MEDIA_CHAPTER_MAX_COUNT)
    throw new PortalError(
      400,
      `Use up to ${MEDIA_CHAPTER_MAX_COUNT} ordered chapter markers.`
    );
  let previous = -1;
  const chapters = values.map((value, index) => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join() !== "startSeconds,title"
    )
      throw new PortalError(
        400,
        `Chapter ${index + 1} needs only a start time in seconds and a title.`
      );
    const { startSeconds, title } = value as Record<string, unknown>;
    if (
      typeof startSeconds !== "number" ||
      !Number.isSafeInteger(startSeconds) ||
      startSeconds < 0 ||
      startSeconds > 604800
    )
      throw new PortalError(
        400,
        `Chapter ${index + 1} needs a whole start time from 0 to 604800 seconds.`
      );
    if (startSeconds <= previous)
      throw new PortalError(
        400,
        `Chapter ${index + 1} must start after the previous chapter. Keep each start time unique and in order.`
      );
    if (durationSeconds !== null && startSeconds >= durationSeconds)
      throw new PortalError(
        400,
        `Chapter ${index + 1} must start before the known recording duration.`
      );
    previous = startSeconds;
    return {
      startSeconds,
      title: plainText(title, 120, `chapter ${index + 1} title`, true)
    };
  });
  return { transcriptText, chapters };
}
