"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore
} from "react";
import { usePathname } from "next/navigation";
import { DraftController } from "@/lib/platform/draft-controller";
const Context = createContext<DraftController | null>(null);
export function DraftWorkspaceProvider({
  children
}: {
  children: React.ReactNode;
}) {
  const [controller] = useState(
    () =>
      new DraftController(async (path, body) => {
        const response = await fetch(path, {
          method: body ? "POST" : "GET",
          cache: "no-store",
          credentials: "same-origin",
          ...(body
            ? { headers: { "Content-Type": "application/json" }, body }
            : {})
        });
        return { status: response.status, data: await response.json() };
      })
  );
  const pathname = usePathname();
  useEffect(() => {
    controller.conceal();
    void controller.verify();
  }, [controller, pathname]);
  useEffect(() => {
    const restore = () => {
      if (document.visibilityState !== "hidden") void controller.verify();
    };
    const visibility = () =>
      document.visibilityState === "hidden" ? controller.conceal() : restore();
    const beforeUnload = (e: BeforeUnloadEvent) => {
      const s = controller.getSnapshot();
      if (
        s.dirty ||
        s.saving ||
        s.conflict ||
        s.retry ||
        s.externalWork.dirty ||
        s.externalWork.saving ||
        s.externalWork.conflict
      ) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("blur", controller.conceal);
    window.addEventListener("focus", restore);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", restore);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      controller.dispose();
      window.removeEventListener("blur", controller.conceal);
      window.removeEventListener("focus", restore);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", restore);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useDraftWorkspace() {
  const controller = useContext(Context);
  if (!controller) throw new Error("Draft workspace provider is required.");
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  );
  return { controller, state };
}
