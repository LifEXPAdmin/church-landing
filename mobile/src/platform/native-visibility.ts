import { requireOptionalNativeModule } from "expo";

type VisibilityBridge = { readWindowFocus(): Promise<unknown> };

/** Lazy and fail closed on an older development binary without this module. */
export async function readNativeWindowFocus(): Promise<boolean> {
  try {
    const bridge = requireOptionalNativeModule<VisibilityBridge>("GCNativeVisibility");
    return await bridge?.readWindowFocus() === true;
  } catch { return false; }
}
