import type { Metadata } from "next";
import {
  MessagePage,
  type MessageParams
} from "@/components/platform/message-page";
export const metadata: Metadata = {
  title: "Messages",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams
}: {
  searchParams: Promise<MessageParams>;
}) {
  return <MessagePage query={await searchParams} />;
}
