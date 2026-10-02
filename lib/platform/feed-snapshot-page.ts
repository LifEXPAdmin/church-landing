/**
 * Recheck ordered references until a full page and one eligible continuation are
 * known. The caller retains its permission transaction and cursor position.
 */
export async function readSnapshotPage<T>(
  references: string[],
  pageSize: number,
  read: (ids: string[]) => Promise<Map<string, T>>
) {
  const ids: string[] = [],
    rows = new Map<string, T>();
  let offset = 0,
    batch = pageSize * 4;
  while (offset < references.length) {
    const chunk = references.slice(offset, offset + batch);
    const available = await read(chunk);
    for (const id of chunk) {
      if (!available.has(id)) continue;
      if (ids.length === pageSize) return { ids, rows, hasMore: true };
      ids.push(id);
      rows.set(id, available.get(id)!);
    }
    offset += chunk.length;
    // Sparse/revoked sets must still reach the end. Increasing the query window
    // bounds round trips without capping the number of references rechecked.
    batch = Math.min(batch * 2, pageSize * 64);
  }
  return { ids, rows, hasMore: false };
}
