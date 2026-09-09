// Preserve historical analytics for administrators, but retire all collection.
// Old clients cannot resume collection or enable proposed reading analytics.
export function POST() {
  return Response.json(
    { ok: false, code: "COLLECTION_RETIRED" },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
