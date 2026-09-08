import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AccountGrantPurpose } from "@prisma/client";
import { accountConfig } from "./account-config";

// No production sender is enabled in this stage. This adapter never calls a mail vendor.
export async function deliverAccountGrant(
  email: string,
  purpose: AccountGrantPurpose,
  token: string
) {
  const config = accountConfig();
  if (config.delivery !== "test-sink" || !config.sinkDirectory)
    throw new Error("Account delivery unavailable");
  const url = new URL("/platform/account/recover", config.origin);
  url.hash = new URLSearchParams({ token, purpose }).toString();
  await mkdir(config.sinkDirectory, { recursive: true, mode: 0o700 });
  await writeFile(
    join(config.sinkDirectory, `${randomUUID()}.json`),
    JSON.stringify({ email, purpose, url: url.toString() }),
    { mode: 0o600, flag: "wx" }
  );
}
