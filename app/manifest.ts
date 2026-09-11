import type { MetadataRoute } from "next";
import { INSTALL_POLICY } from "@/lib/platform/install-policy";

export default function manifest(): MetadataRoute.Manifest {
  return {
    ...INSTALL_POLICY,
    icons: INSTALL_POLICY.icons.map((icon) => ({ ...icon }))
  };
}
