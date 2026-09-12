import { PortalError } from "./portal-policy";
export function postField(value: unknown, maximum: number, minimum = 0) {
  // Native multipart forms encode textarea newlines as CRLF. Count and store
  // the same logical newlines the textarea's length limit presents to people.
  const text = typeof value === "string" ? value.replace(/\r\n?/g, "\n") : null;
  if (text === null || text.length > maximum || text.trim().length < minimum)
    throw new PortalError(
      400,
      `Use ${minimum}–${maximum} characters for this field. Your text has not been shortened.`
    );
  return text.trim();
}
export function postId(value: unknown) {
  const id = postField(value, 100, 1);
  if (!/^[A-Za-z0-9_-]+$/.test(id))
    throw new PortalError(400, "Use a valid post or church reference.");
  return id;
}
