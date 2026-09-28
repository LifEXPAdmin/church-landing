import { PortalError } from "./portal-policy";
import type { ArtistLink } from "./artist-types";
const invalid = () =>
  new PortalError(
    400,
    "Use a canonical Spotify, Apple Music or Bandcamp album or track HTTPS link without tracking or private parameters."
  );
/** Pure syntax policy. Never contacts a provider or claims availability/rights. */
export function artistLink(value: unknown): ArtistLink {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    !value.isWellFormed() ||
    /[\s\\\u0000-\u001f\u007f-\u009f]/u.test(value) ||
    /%(?:2f|5c|00|0[ad])/i.test(value) ||
    /%(?![0-9a-f]{2})/i.test(value)
  )
    throw invalid();
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw invalid();
  }
  if (
    value.includes("#") ||
    /^https:\/\/[^/]*@/.test(value) ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    !value.startsWith("https://") ||
    /https:\/\/[^/]*:\d/.test(value)
  )
    throw invalid();
  const host = u.hostname,
    path = u.pathname;
  if (host === "open.spotify.com") {
    const m = /^\/(album|track)\/([A-Za-z0-9]{22})$/.exec(path);
    if (!m || u.search) throw invalid();
    return {
      provider: "Spotify",
      kind: m[1] as "album" | "track",
      url: `https://${host}/${m[1]}/${m[2]}`
    };
  }
  if (host === "music.apple.com") {
    const m =
      /^\/([A-Za-z]{2})\/(album|song)\/([^/]+)\/([1-9][0-9]{0,19})$/.exec(path);
    if (!m) throw invalid();
    let slug: string;
    try {
      slug = decodeURIComponent(m[3]);
    } catch {
      throw invalid();
    }
    if (
      !slug ||
      slug.length > 200 ||
      /[\/\\\u0000-\u001f\u007f-\u009f]/.test(slug)
    )
      throw invalid();
    const keys = [...u.searchParams.keys()],
      track = u.searchParams.get("i");
    if (
      keys.length &&
      (keys.length !== 1 ||
        keys[0] !== "i" ||
        m[2] !== "album" ||
        !/^[1-9][0-9]{0,19}$/.test(track ?? ""))
    )
      throw invalid();
    return {
      provider: "Apple Music",
      kind: m[2] === "song" || track ? "track" : "album",
      url: `https://${host}/${m[1].toLowerCase()}/${m[2]}/${encodeURIComponent(slug)}/${m[4]}${track ? `?i=${track}` : ""}`
    };
  }
  const band = /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.bandcamp\.com$/.exec(
      host
    ),
    item = /^\/(album|track)\/([A-Za-z0-9-]{1,200})$/.exec(path);
  if (
    band &&
    item &&
    !u.search &&
    ![
      "www",
      "daily",
      "blog",
      "get",
      "help",
      "support",
      "auth",
      "login",
      "stats",
      "api"
    ].includes(band[1])
  )
    return {
      provider: "Bandcamp",
      kind: item[1] as "album" | "track",
      url: `https://${host}${path}`
    };
  throw invalid();
}
