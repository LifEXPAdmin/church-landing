// Limited formatting uses escaped React text. User HTML and embedded media are inert.
export function PostText({ content }: { content: string }) {
  const blocks: { kind: "p" | "ul" | "ol"; lines: string[] }[] = [];
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
      continue;
    }
    const item = /^\s*(?:([-*])|\d+[.)])\s+(.+)$/.exec(line);
    const kind = item ? (item[1] ? "ul" : "ol") : "p";
    const last = blocks.at(-1);
    if (last?.kind === kind && last.lines.length)
      last.lines.push(item ? item[2] : line);
    else blocks.push({ kind, lines: [item ? item[2] : line] });
  }
  return (
    <div className="gc-post-body space-y-3">
      {blocks
        .filter((b) => b.lines.length)
        .map((block, index) =>
          block.kind === "p" ? (
            <p key={index} className="whitespace-pre-wrap">
              {block.lines.join("\n")}
            </p>
          ) : block.kind === "ul" ? (
            <ul key={index} className="list-disc space-y-1 pl-6">
              {block.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          ) : (
            <ol key={index} className="list-decimal space-y-1 pl-6">
              {block.lines.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          )
        )}
    </div>
  );
}
