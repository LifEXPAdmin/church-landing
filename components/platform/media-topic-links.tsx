import Link from "next/link";

export function MediaTopicLinks({ topics }: { topics: readonly string[] }) {
  if (!topics.length) return null;
  return (
    <ul aria-label="Browse media topics" className="flex flex-wrap gap-2">
      {topics.map((topic) => (
        <li key={topic} className="max-w-full">
          <Link
            href={`/platform/media?topic=${encodeURIComponent(topic)}`}
            prefetch={false}
            className="inline-flex min-h-11 max-w-full items-center rounded-full border px-4 py-2 underline [overflow-wrap:anywhere]"
          >
            {topic}
          </Link>
        </li>
      ))}
    </ul>
  );
}
