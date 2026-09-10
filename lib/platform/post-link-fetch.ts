import { BlockList, isIP } from "node:net";
import { Resolver } from "node:dns/promises";
import { request, type RequestOptions } from "node:https";
import { parse } from "parse5";

export class UnsafePostLink extends Error {}
const denied4 = new BlockList(),
  denied6 = new BlockList(),
  global6 = new BlockList();
// Conservative public-unicast policy, including IANA special-use space and
// Azure's virtual platform address. Revisit these tables when adding protocols.
for (const [ip, bits] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4]
] as const)
  denied4.addSubnet(ip, bits, "ipv4");
denied4.addAddress("168.63.129.16", "ipv4");
global6.addSubnet("2000::", 3, "ipv6");
for (const [ip, bits] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20]
] as const)
  denied6.addSubnet(ip, bits, "ipv6");
export function publicPostAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !denied4.check(address, "ipv4")
    : family === 6 &&
        global6.check(address, "ipv6") &&
        !denied6.check(address, "ipv6");
}
function unsafe(): never {
  throw new UnsafePostLink(
    "Use a public HTTPS link without a sign-in, credentials or a custom port."
  );
}
export function publicPostUrl(value: unknown): URL {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\u0000-\u0020\u007f\\]/.test(value)
  )
    unsafe();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return unsafe();
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    unsafe();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (!publicPostAddress(host)) unsafe();
  } else if (
    host.length > 253 ||
    !host.includes(".") ||
    !host
      .split(".")
      .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
    /(?:^|\.)(?:localhost|local|internal|localdomain|home|lan|onion|arpa)$/.test(
      host
    )
  )
    unsafe();
  if (url.href.length > 2048) unsafe();
  return url;
}
export const LINK_MAX_BYTES = 256 * 1024;
export const LINK_DEADLINE_MS = 6000;
export type LinkMetadata = {
  title: string | null;
  description: string | null;
  sourceUrl: string;
};
export type LinkReply = { status: number; location?: string; html?: string };
export type LinkTransport = {
  resolve: (host: string, signal: AbortSignal) => Promise<string[]>;
  request: (
    url: URL,
    address: string,
    signal: AbortSignal
  ) => Promise<LinkReply>;
};
export async function resolvePostHost(
  host: string,
  signal: AbortSignal
): Promise<string[]> {
  const resolver = new Resolver({ timeout: 1500, tries: 1 });
  const abort = () => resolver.cancel();
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, { once: true });
  try {
    const answers = await Promise.allSettled([
      resolver.resolve4(host),
      resolver.resolve6(host)
    ]);
    const addresses = answers.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );
    // Inspect successful answers even when the other family failed.
    if (addresses.some((ip) => !publicPostAddress(ip))) unsafe();
    if (
      answers.some(
        (r) =>
          r.status === "rejected" &&
          !["ENODATA", "ENOTFOUND"].includes(r.reason?.code)
      )
    )
      throw new Error("DNS unavailable");
    return addresses;
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export function pinnedPostRequestOptions(
  url: URL,
  address: string,
  signal: AbortSignal
): RequestOptions {
  const hostname = url.hostname.replace(/^\[|\]$/g, ""),
    family = isIP(address);
  if (!family || !publicPostAddress(address)) unsafe();
  return {
    protocol: "https:",
    hostname,
    port: 443,
    path: url.pathname + url.search,
    method: "GET",
    agent: false,
    signal,
    rejectUnauthorized: true,
    ...(isIP(hostname) ? {} : { servername: hostname }),
    // An explicit family disables Node's automatic family selection. Only this
    // validated address may be returned by lookup, even if DNS changes now.
    family,
    lookup: (_host, _options, callback) => callback(null, address, family),
    maxHeaderSize: 16384,
    headers: {
      Accept: "text/html",
      "Accept-Encoding": "identity",
      "User-Agent": "Godschurches-LinkPreview/1.0"
    }
  };
}
export function requestPostHtml(
  url: URL,
  address: string,
  signal: AbortSignal
): Promise<LinkReply> {
  return new Promise((resolve, reject) => {
    const req = request(
      pinnedPostRequestOptions(url, address, signal),
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status)) {
          resolve({ status, location: response.headers.location });
          response.destroy();
          return;
        }
        if (
          status !== 200 ||
          !/^text\/html(?:\s*;|$)/i.test(
            response.headers["content-type"] ?? ""
          ) ||
          (response.headers["content-encoding"] &&
            response.headers["content-encoding"] !== "identity") ||
          Number(response.headers["content-length"] ?? 0) > LINK_MAX_BYTES
        ) {
          reject(new Error("Preview unavailable"));
          response.destroy();
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > LINK_MAX_BYTES) {
            reject(new Error("Preview too large"));
            response.destroy();
          } else chunks.push(chunk);
        });
        response.on("error", reject);
        response.on("aborted", () => reject(new Error("Preview interrupted")));
        response.on("end", () => {
          try {
            resolve({
              status,
              html: new TextDecoder("utf-8", { fatal: true }).decode(
                Buffer.concat(chunks)
              )
            });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}
const transport: LinkTransport = {
  resolve: resolvePostHost,
  request: requestPostHtml
};
async function destination(url: URL, io: LinkTransport, signal: AbortSignal) {
  signal.throwIfAborted();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await io.resolve(host, signal);
  if (addresses.some((ip) => !publicPostAddress(ip))) unsafe();
  if (!addresses.length || addresses.length > 32)
    throw new Error("DNS unavailable");
  signal.throwIfAborted();
  return addresses[0];
}
async function bounded<T>(
  work: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal
) {
  const timer = AbortSignal.timeout(LINK_DEADLINE_MS);
  const combined = signal ? AbortSignal.any([timer, signal]) : timer;
  combined.throwIfAborted();
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work(combined),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error("Preview timed out"));
        combined.addEventListener("abort", abort, { once: true });
      })
    ]);
  } finally {
    combined.removeEventListener("abort", abort);
  }
}
// This check performs DNS only, never HTTP. An unavailable host can remain a
// plain link; a known private destination is rejected. No database lock is held.
export async function validatePostLink(value: unknown, io = transport) {
  const url = publicPostUrl(value);
  try {
    await bounded((signal) => destination(url, io, signal));
  } catch (error) {
    if (error instanceof UnsafePostLink) throw error;
  }
  return url.href;
}
export function parsePostMetadata(
  html: string,
  sourceUrl: string
): LinkMetadata | null {
  if (Buffer.byteLength(html) > LINK_MAX_BYTES)
    throw new Error("Preview too large");
  const doc = parse(html),
    root = doc.childNodes.find((n) => n.nodeName === "html");
  const head =
    root && "childNodes" in root
      ? root.childNodes.find((n) => n.nodeName === "head")
      : null;
  const clean = (text: string, limit: number) =>
    text
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit) || null;
  let title = "",
    ogTitle = "",
    description = "",
    ogDescription = "";
  if (head && "childNodes" in head)
    for (const node of head.childNodes) {
      if (node.nodeName === "title" && "childNodes" in node && !title)
        title = node.childNodes
          .map((n) => ("value" in n ? n.value : ""))
          .join("");
      if (node.nodeName === "meta" && "attrs" in node) {
        const key = node.attrs
          .find((a) => a.name === "property" || a.name === "name")
          ?.value.toLowerCase();
        const value = node.attrs.find((a) => a.name === "content")?.value ?? "";
        if (key === "og:title" && !ogTitle) ogTitle = value;
        if (key === "og:description" && !ogDescription) ogDescription = value;
        if (key === "description" && !description) description = value;
      }
    }
  const result = {
    title: clean(ogTitle || title, 200),
    description: clean(ogDescription || description, 400),
    sourceUrl
  };
  return result.title || result.description ? result : null;
}
export async function fetchPostPreview(
  value: unknown,
  io = transport,
  signal?: AbortSignal
): Promise<LinkMetadata | null> {
  const initial = publicPostUrl(value);
  try {
    return await bounded(async (signal) => {
      let url = initial;
      for (let hop = 0; hop <= 3; hop++) {
        const address = await destination(url, io, signal);
        const response = await io.request(url, address, signal);
        signal.throwIfAborted();
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (!response.location || hop === 3)
            throw new Error("Redirect unavailable");
          if (/[\u0000-\u0020\u007f\\]/.test(response.location)) unsafe();
          url = publicPostUrl(new URL(response.location, url).href);
        } else {
          if (response.status !== 200 || !response.html) return null;
          return parsePostMetadata(response.html, url.href);
        }
      }
      return null;
    }, signal);
  } catch (error) {
    if (error instanceof UnsafePostLink) throw error;
    return null;
  }
}
