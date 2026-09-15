"use client";
import Link from "next/link";
export default function TopicError({ reset }: { reset: () => void }) {
  return (
    <section className="container-shell space-y-4 py-8">
      <h1 className="text-3xl">This topic page could not be loaded</h1>
      <p role="status">
        Your saved choices are unchanged. Reconnect and try again.
      </p>
      <button className="gc-button" onClick={reset}>
        Try loading again
      </button>{" "}
      <Link className="gc-button gc-button-quiet" href="/platform/topics">
        Discover topics
      </Link>
    </section>
  );
}
