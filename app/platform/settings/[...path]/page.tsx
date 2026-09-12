import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SettingsPage } from "@/components/platform/settings-page";
import {
  settingsFolders,
  settingsRegistry
} from "@/lib/platform/settings-registry";
type Props = { params: Promise<{ path: string[] }> };
function route(path: string[]) {
  const folder = settingsFolders.find((f) => f.id === path[0]);
  const setting = path[1]
    ? settingsRegistry.find(
        (s) =>
          s.folder === path[0] &&
          s.id.split(".")[1] === path[1] &&
          "control" in s.destination &&
          s.state !== "future"
      )
    : undefined;
  if (!folder || path.length > 2 || (path[1] && !setting)) notFound();
  return { folder, setting };
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { folder, setting } = route((await params).path);
  return {
    title: setting?.label ?? folder.label,
    robots: { index: false, follow: false }
  };
}
export default async function Page({ params }: Props) {
  const { path } = await params;
  route(path);
  return <SettingsPage folder={path[0]} setting={path[1]} />;
}
