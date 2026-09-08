import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DemoScreen } from "@/components/platform/demo-views";
import { demoViews, findDemoView } from "@/lib/platform/demo-fixtures";

export const dynamicParams = false;

export function generateStaticParams() {
  return demoViews.map(({ slug }) => ({ view: slug }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ view: string }>;
}): Promise<Metadata> {
  const { view } = await params;
  const definition = findDemoView(view);
  return {
    title: definition ? `${definition.title} demo` : "Demo view unavailable"
  };
}

export default async function DemoViewPage({
  params
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;
  const definition = findDemoView(view);
  if (!definition) notFound();
  return <DemoScreen view={definition.slug} />;
}
