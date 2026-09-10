// Safe to share with the composer; no database or credential dependencies.
export const POST_TOPICS = [
  "prayer",
  "testimony",
  "scripture",
  "fasting",
  "worship",
  "service",
  "community",
  "family",
  "questions",
  "encouragement"
] as const;
export const normalizedPostText = (value: string) =>
  value.replace(/\r\n?/g, "\n");
