"use client";
import { createContext, useContext, useState } from "react";
import Link from "next/link";
type Loaded = {
  build: string | null;
  id: string | null;
  version: string | null;
};
const Context = createContext<Loaded>({ build: null, id: null, version: null });
export function LoadedReleaseProvider({
  value,
  children
}: {
  value: Loaded;
  children: React.ReactNode;
}) {
  const [loaded] = useState(value);
  return <Context.Provider value={loaded}>{children}</Context.Provider>;
}
export function useLoadedRelease() {
  return useContext(Context);
}
export function LoadedVersion() {
  const loaded = useLoadedRelease();
  return (
    <Link
      className="inline-flex min-h-11 items-center text-sm underline"
      href={
        loaded.id ? `/platform/releases/${loaded.id}` : "/platform/releases"
      }
    >
      App version {loaded.version ?? "unknown"}
    </Link>
  );
}
