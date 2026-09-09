// Only navigation requests redirect. A stale form body must never enter the app.
export function GET() {
  return new Response(null, {
    status: 307,
    headers: { Location: "/platform" }
  });
}
