export function GET() {
  // Visiting an old confirmation URL must not imply that a submission succeeded.
  return new Response(null, {
    status: 307,
    headers: { Location: "/platform" }
  });
}
