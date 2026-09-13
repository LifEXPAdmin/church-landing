import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MessagePage,
  type MessageParams
} from "@/components/platform/message-page";
import { readerId } from "@/lib/platform/reader-navigation";
export const metadata: Metadata = {
  title: "Private conversation",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";
export default async function Page({
  params,
  searchParams
}: {
  params: Promise<{ conversationId: string }>;
  searchParams: Promise<MessageParams>;
}) {
  const id = readerId((await params).conversationId);
  if (!id) notFound();
  return <MessagePage conversationId={id} query={await searchParams} />;
}
