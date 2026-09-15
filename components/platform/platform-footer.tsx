"use client";

import Link from "next/link";
import { MissionSignature } from "@/components/layout/site-footer";
import { AppearanceSelect } from "./reading-preferences";
import { LoadedVersion } from "./loaded-release";

// Keep this repeated, interactive shell section in one synchronous client
// component. The bundled Next 15 renderer cannot safely replay a host parent's
// hydration when its outlined Flight footer resolves during the same microtask.
// Server rendering and the initial client tree still produce identical markup.
export function PlatformFooter() {
  return (
    <footer className="gc-platform-footer">
      <AppearanceSelect />
      <LoadedVersion />
      <Link href="/platform/features">Explore features</Link>
      <Link href="/platform/releases">What’s new</Link>
      <MissionSignature />
      <Link href="/about#our-mission">Our mission</Link>
      <Link href="/help">Help</Link>
      <Link href="/privacy">Privacy</Link>
      <Link href="/terms">Terms</Link>
    </footer>
  );
}
