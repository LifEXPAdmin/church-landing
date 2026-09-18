import type { Prisma, PrismaClient } from "@prisma/client";
import { withOwnedSession } from "./account-sessions";
import { adminAuthority } from "./admin-authority";
import { expected, PortalError } from "./portal-policy";
import { socialCommand, socialInput } from "./social-operations";
import {
  menuNavigation,
  administrationNavigation,
  navigationItem,
  type NavigationId
} from "./navigation-registry";

export const MAX_MENU_SHORTCUTS = 6;
async function stateIn(tx: Prisma.TransactionClient, ownerId: string) {
  const user = await tx.platformUser.findUniqueOrThrow({
    where: { id: ownerId },
    select: { username: true }
  });
  let adminAvailable = false;
  try {
    adminAvailable = !!(await adminAuthority(tx, ownerId)).navigation.sections
      .length;
  } catch {
    // Optional administration remains absent unless its existing owner permits it.
  }
  const context = { username: user.username, adminAvailable };
  const choices = [
    ...menuNavigation(context).flatMap((group) => group.items),
    ...administrationNavigation(context),
    navigationItem("qr", context)
  ];
  const current = await tx.socialPreferences.findUnique({
    where: { ownerId },
    select: { menuShortcutIds: true, menuShortcutsVersion: true }
  });
  const allowed = new Set<string>(choices.map((item) => item.id));
  const ids = [...new Set(current?.menuShortcutIds ?? [])]
    .filter((id): id is NavigationId => allowed.has(id))
    .slice(0, MAX_MENU_SHORTCUTS);
  return {
    ownerId,
    limit: MAX_MENU_SHORTCUTS,
    version: current?.menuShortcutsVersion ?? 0,
    ids,
    // Never send raw stored IDs, a stale URL or former capability metadata.
    choices
  };
}
export type MenuShortcutsState = Awaited<ReturnType<typeof stateIn>>;
export function readMenuShortcuts(db: PrismaClient, token: unknown) {
  return withOwnedSession(
    db,
    token,
    (tx, current) => stateIn(tx, current.userId),
    "shared"
  );
}
export function saveMenuShortcuts(
  db: PrismaClient,
  token: unknown,
  input: Record<string, unknown>
) {
  socialInput(input, ["mutationId", "expectedVersion", "ids"]);
  if (
    !Array.isArray(input.ids) ||
    input.ids.length > MAX_MENU_SHORTCUTS ||
    input.ids.some((id) => typeof id !== "string" || id.length > 80) ||
    new Set(input.ids).size !== input.ids.length
  )
    throw new PortalError(
      400,
      "Choose up to six different available Menu shortcuts."
    );
  const ids = input.ids as string[];
  let current: MenuShortcutsState;
  return socialCommand(
    db,
    token,
    "menu-shortcuts",
    input,
    async (tx, ownerId) => {
      expected(input.expectedVersion, current.version);
      const row = await tx.socialPreferences.upsert({
        where: { ownerId },
        create: { ownerId, menuShortcutIds: ids, menuShortcutsVersion: 1 },
        update: {
          menuShortcutIds: ids,
          menuShortcutsVersion: { increment: 1 }
        },
        select: { menuShortcutsVersion: true }
      });
      return {
        id: ownerId,
        version: row.menuShortcutsVersion,
        message: ids.length
          ? "Your Menu shortcuts were saved."
          : "Your Menu shortcuts were reset."
      };
    },
    async (tx, ownerId) => {
      current = await stateIn(tx, ownerId);
      const allowed = new Set<string>(current.choices.map((item) => item.id));
      if (ids.some((id) => !allowed.has(id)))
        throw new PortalError(
          403,
          "A shortcut is no longer available. Reload current Menu choices."
        );
    },
    "shared"
  );
}
