// Metadata is inert text. Readers never fetch third-party assets or HTML.
export function PostLink({
  linkUrl,
  linkTitle,
  linkDescription,
  linkSourceUrl
}: {
  linkUrl?: string | null;
  linkTitle?: string | null;
  linkDescription?: string | null;
  linkSourceUrl?: string | null;
}) {
  if (!linkUrl) return null;
  let source: URL;
  try {
    source = new URL(linkSourceUrl || linkUrl);
  } catch {
    return null;
  }
  if (source.protocol !== "https:" || source.username || source.password)
    return null;
  return (
    <div className="my-4 min-w-0 space-y-2 rounded-xl border border-gc-divider p-4 [overflow-wrap:anywhere]">
      {linkTitle && <p className="font-semibold">{linkTitle}</p>}
      {linkDescription && (
        <p className="text-sm text-gc-muted">{linkDescription}</p>
      )}
      <a
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="inline-flex min-h-11 items-center text-gc-accent underline"
      >
        {linkTitle || linkDescription ? `Open ${source.hostname}` : source.href}{" "}
        (opens in a new tab)
      </a>
    </div>
  );
}
