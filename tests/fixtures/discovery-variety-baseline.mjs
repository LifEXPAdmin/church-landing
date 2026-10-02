// Preserved pre-optimization behavior from 27e81cc for exact-order comparisons.
export function applyDiscoveryVariety(rows) {
  const pending = [...rows],
    ordered = [],
    recent = [];
  const author = (row) =>
    row.post.authorChurchId
      ? "church:" + row.post.authorChurchId
      : "person:" + row.post.authorId;
  while (pending.length) {
    const counts = new Map();
    recent.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1));
    const alternative = pending.findIndex(
      (row) => (counts.get(author(row)) ?? 0) < 3
    );
    const [chosen] = pending.splice(alternative < 0 ? 0 : alternative, 1);
    ordered.push(chosen);
    recent.push(author(chosen));
    if (recent.length > 19) recent.shift();
  }
  return ordered;
}
