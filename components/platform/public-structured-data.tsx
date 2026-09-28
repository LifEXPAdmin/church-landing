import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { CSP_NONCE_HEADER } from "@/lib/security/content-security-policy";
import {
  publicStructuredData,
  serializeStructuredData
} from "@/lib/platform/public-structured-data";

export async function PublicStructuredData({
  kind,
  id
}: {
  kind: "church" | "event";
  id: string;
}) {
  try {
    const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;
    const value = await publicStructuredData(prisma, kind, id);
    return value ? (
      <script
        nonce={nonce}
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(value) }}
      />
    ) : null;
  } catch {
    return null;
  }
}
