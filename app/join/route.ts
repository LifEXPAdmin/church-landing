export function GET() {
  // Old role/source/return parameters neither create an account nor grant a role.
  return new Response(null, {
    status: 307,
    headers: { Location: "/platform/signup", "Cache-Control": "no-store" }
  });
}

export function POST() {
  return Response.json(
    {
      success: false,
      code: "WAITLIST_RETIRED",
      message:
        "Waitlist submissions are closed. Create an account at /platform/signup."
    },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
