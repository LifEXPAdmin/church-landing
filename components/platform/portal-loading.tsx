export function PortalLoading() {
  return (
    <div className="min-h-screen bg-[#100b07] text-[#f8ead6]">
      <section
        className="container-shell py-10"
        aria-busy="true"
        aria-label="Loading church information"
      >
        <p role="status" className="text-lg text-[#f4c98c]">
          Loading church information...
        </p>
        <div
          aria-hidden="true"
          className="mt-6 space-y-5 motion-safe:animate-pulse"
        >
          <div className="h-10 w-2/3 rounded-lg bg-[#f2d8af]/10" />
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="h-44 rounded-2xl border border-[#f2d8af]/15 bg-[#1a120c]" />
            <div className="h-44 rounded-2xl border border-[#f2d8af]/15 bg-[#1a120c]" />
          </div>
        </div>
      </section>
    </div>
  );
}
