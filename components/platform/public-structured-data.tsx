import { prisma } from "@/lib/prisma";
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
    const value = await publicStructuredData(prisma, kind, id);
    return value ? (
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeStructuredData(value) }}
      />
    ) : null;
  } catch {
    return null;
  }
}
