import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { prisma } from "@/lib/prisma";
import { accountConfig } from "./account-config";
import {
  publicSharePreview,
  canonicalSharePath,
  type ShareKind
} from "./public-sharing";
/** Anonymous preview is the only source of resource metadata, even when signed in. */
export async function publicResourceMetadata(
  kind: ShareKind,
  id: string
): Promise<Metadata> {
  noStore();
  const origin = accountConfig().origin;
  let preview: Awaited<ReturnType<typeof publicSharePreview>> | null = null;
  try {
    preview = await publicSharePreview(prisma, { kind, id });
  } catch {
    /* Generic branding also covers unavailable service and invalid source IDs. */
  }
  const title = preview?.title ?? "Godschurches",
    description =
      preview?.description ??
      "Open Godschurches to view this page and check your access.";
  let url: string | undefined;
  try {
    url = new URL(canonicalSharePath(kind, id), origin).href;
  } catch {}
  const image = preview?.image ?? {
    url: new URL("/brand/share-card.png", origin).href,
    width: 1200,
    height: 630,
    alt: "Godschurches — faith and community"
  };
  return {
    title: { absolute: title },
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    ...(!preview?.available || kind === "church" || kind === "event"
      ? { robots: { index: false, follow: false } }
      : {}),
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Godschurches",
      ...(url ? { url } : {}),
      images: [image]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image.url, alt: image.alt }]
    },
    ...(preview?.author ? { authors: [{ name: preview.author.name }] } : {})
  };
}
