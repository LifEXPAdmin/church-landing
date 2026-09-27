import { PortalError } from "./portal-policy";
export type CatalogSource = {
  provider: "YOUTUBE" | "VIMEO" | "SOUNDCLOUD";
  url: string;
  providerId: string;
};
const unavailable = () =>
  new PortalError(
    400,
    "Use a canonical public YouTube video, Vimeo video or SoundCloud track link, without extra options, private access tokens or fragments."
  );
/** Syntax only: never fetch, scrape, resolve DNS or infer remote availability. */
export function catalogSource(value: unknown): CatalogSource | null {
  if (value === null || value === undefined || value === "") return null;
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\\%#\u0000-\u001f\u007f-\uffff]/.test(value) ||
    !value.startsWith("https://")
  )
    throw unavailable();
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw unavailable();
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.port ||
    u.hash ||
    /\/(?:\.|\.\.)(?:\/|$|\?)/.test(value) ||
    value.endsWith("?")
  )
    throw unavailable();
  const yt = ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
    u.hostname
  );
  let id: string | null = null;
  if (
    yt &&
    u.pathname === "/watch" &&
    [...u.searchParams.keys()].length === 1 &&
    u.searchParams.getAll("v").length === 1
  )
    id = u.searchParams.get("v");
  else if (yt && !u.search)
    id =
      /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})$/.exec(u.pathname)?.[1] ?? null;
  else if (u.hostname === "youtu.be" && !u.search)
    id = /^\/([A-Za-z0-9_-]{11})$/.exec(u.pathname)?.[1] ?? null;
  if (id && /^[A-Za-z0-9_-]{11}$/.test(id))
    return {
      provider: "YOUTUBE",
      providerId: id,
      url: `https://www.youtube.com/watch?v=${id}`
    };
  if (["vimeo.com", "www.vimeo.com"].includes(u.hostname) && !u.search) {
    id = /^\/([1-9][0-9]{0,19})$/.exec(u.pathname)?.[1] ?? null;
    if (id)
      return {
        provider: "VIMEO",
        providerId: id,
        url: `https://vimeo.com/${id}`
      };
  }
  if (
    ["soundcloud.com", "www.soundcloud.com"].includes(u.hostname) &&
    !u.search
  ) {
    const m = /^\/([A-Za-z0-9_-]{1,100})\/([A-Za-z0-9_-]{1,100})$/.exec(
      u.pathname
    );
    const reserved = [
      "you",
      "discover",
      "stream",
      "search",
      "upload",
      "settings",
      "pages",
      "terms-of-use",
      "privacy",
      "jobs",
      "popular",
      "charts",
      "stations",
      "sets",
      "playlists",
      "messages",
      "notifications",
      "premium",
      "go",
      "signin",
      "signout",
      "login",
      "logout",
      "connect",
      "oauth",
      "developers",
      "people",
      "tracks",
      "groups",
      "mobile"
    ];
    if (
      m &&
      !reserved.includes(m[1].toLowerCase()) &&
      !["sets", "tracks", "albums", "reposts", "likes"].includes(
        m[2].toLowerCase()
      ) &&
      !/^s-/i.test(m[2])
    )
      return {
        provider: "SOUNDCLOUD",
        providerId: `${m[1]}/${m[2]}`,
        url: `https://soundcloud.com/${m[1]}/${m[2]}`
      };
  }
  throw unavailable();
}
