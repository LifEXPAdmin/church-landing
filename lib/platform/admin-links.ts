export function adminSelection(value: unknown): string[] {
  if (typeof value !== "string" || value.length > 1100) return [];
  const values = value.split(",");
  if (
    values.length > 10 ||
    values.some((v) => !/^(SUPPORT|REPORT|CLAIM):[A-Za-z0-9_-]{1,100}$/.test(v))
  )
    return [];
  return [...new Set(values)];
}
export function adminReturnTo(value: unknown) {
  if (typeof value !== "string" || value.length > 2200)
    return "/platform/admin/requests";
  try {
    const url = new URL(value, "https://godschurches.invalid");
    if (
      url.origin !== "https://godschurches.invalid" ||
      url.pathname !== "/platform/admin/requests" ||
      (url.hash && !/^#request-[A-Za-z0-9_-]{1,100}$/.test(url.hash))
    )
      throw Error();
    const allowed = [
      "type",
      "state",
      "priority",
      "owner",
      "age",
      "churchId",
      "topicId",
      "q",
      "tag",
      "due",
      "after",
      "selected"
    ];
    if (
      [...url.searchParams.keys()].some(
        (k) => !allowed.includes(k) || url.searchParams.getAll(k).length !== 1
      )
    )
      throw Error();
    if (
      url.searchParams.has("selected") &&
      !adminSelection(url.searchParams.get("selected")).length
    )
      throw Error();
    return url.pathname + url.search + url.hash;
  } catch {
    return "/platform/admin/requests";
  }
}
