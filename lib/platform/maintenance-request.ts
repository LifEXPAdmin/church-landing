import { timingSafeEqual } from "node:crypto";
export const maintenanceHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff"
};
export function maintenanceRequestError(request: Request) {
  const secret = process.env.CRON_SECRET,
    supplied = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: maintenanceHeaders }
    );
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { ...maintenanceHeaders, Allow: "GET" } }
    );
  return null;
}
