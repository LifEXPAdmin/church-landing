import Link from "next/link";

interface SegmentPageProps {
  title: string;
  intro: string;
  bullets: string[];
  note?: string;
}

export function SegmentPage({ title, intro, bullets, note }: SegmentPageProps) {
  return (
    <section className="container-shell py-10 sm:py-16">
      <article className="gc-info-article">
        <p className="gc-eyebrow">Life together</p>
        <h1>{title}</h1>
        <p className="gc-info-intro">{intro}</p>
        <ul className="gc-info-list">
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {note && <p>{note}</p>}
        <div className="gc-info-actions">
          <Link href="/platform/signup" className="gc-button">
            Create an account
          </Link>
          <Link href="/platform" className="gc-button gc-button-quiet">
            Read public posts
          </Link>
        </div>
        <p>
          <Link href="/about">About Godschurches</Link> ·{" "}
          <Link href="/help">Account and church help</Link>
        </p>
      </article>
    </section>
  );
}
