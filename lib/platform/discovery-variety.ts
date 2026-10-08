type AuthorPost = { authorId: string; authorChurchId: string | null };
type AuthorQueue = { author: string; positions: number[]; offset: number };

/** Preserve ranked priority while limiting an author to three of the prior 19. */
export function applyDiscoveryVariety<T extends { post: AuthorPost }>(
  rows: T[]
): T[] {
  const authors = new Map<string, AuthorQueue>();
  rows.forEach((row, position) => {
    const author = row.post.authorChurchId
      ? "church:" + row.post.authorChurchId
      : "person:" + row.post.authorId;
    let queue = authors.get(author);
    if (!queue) {
      queue = { author, positions: [], offset: 0 };
      authors.set(author, queue);
    }
    queue.positions.push(position);
  });

  // One head per author suffices: all later rows by that author have the same
  // eligibility, and must retain their original relative order.
  const heap: AuthorQueue[] = [];
  const position = (queue: AuthorQueue) => queue.positions[queue.offset];
  function push(queue: AuthorQueue) {
    let index = heap.length;
    heap.push(queue);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (position(heap[parent]) < position(queue)) break;
      heap[index] = heap[parent];
      index = parent;
    }
    heap[index] = queue;
  }
  function pop(): AuthorQueue | undefined {
    const first = heap[0],
      last = heap.pop();
    if (heap.length && last) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (
          child + 1 < heap.length &&
          position(heap[child + 1]) < position(heap[child])
        )
          child++;
        if (position(last) < position(heap[child])) break;
        heap[index] = heap[child];
        index = child;
      }
      heap[index] = last;
    }
    return first;
  }
  for (const queue of authors.values()) push(queue);
  const ordered: T[] = [],
    recent: string[] = [];
  const counts = new Map<string, number>();
  while (heap.length) {
    const blocked: AuthorQueue[] = [];
    let chosen = pop();
    while (chosen && (counts.get(chosen.author) ?? 0) >= 3) {
      blocked.push(chosen);
      chosen = pop();
    }
    // At most six authors can have three entries among the prior 19. If all
    // remaining authors are blocked, retain the original first-row fallback.
    chosen ??= blocked.shift()!;
    ordered.push(rows[position(chosen)]);
    chosen.offset++;
    if (chosen.offset < chosen.positions.length) push(chosen);
    for (const queue of blocked) push(queue);
    counts.set(chosen.author, (counts.get(chosen.author) ?? 0) + 1);
    recent.push(chosen.author);
    if (recent.length > 19) {
      const expired = recent.shift()!;
      const remaining = counts.get(expired)! - 1;
      if (remaining) counts.set(expired, remaining);
      else counts.delete(expired);
    }
  }
  return ordered;
}
