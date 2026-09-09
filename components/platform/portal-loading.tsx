export function PortalLoading() {
  return (
    <div className="min-h-screen bg-gc-canvas text-gc-text">
      <section
        className="container-shell py-10"
        aria-busy="true"
        aria-label="Loading church information"
      >
        <p role="status" className="text-lg text-gc-accent">
          Loading church information...
        </p>
        <div
          aria-hidden="true"
          className="mt-6 space-y-5 motion-safe:animate-pulse"
        >
          <div className="h-10 w-2/3 rounded-lg bg-gc-subtle" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="h-44 rounded-xl border border-gc-divider bg-gc-surface" />
            <div className="h-44 rounded-xl border border-gc-divider bg-gc-surface" />
          </div>
        </div>
      </section>
    </div>
  );
}
