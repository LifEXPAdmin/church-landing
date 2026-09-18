import type { ChurchConnectionState, Prisma } from "@prisma/client";
import { effectiveChurchGrants } from "./church-permissions";
import { privilegedProjectionAvailable } from "./privileged-auth-policy";

/** Read-only projection of existing connections and current assigned authority. */
export async function settingsChurchIn(
  tx: Prisma.TransactionClient,
  userId: string,
  eligible: boolean,
  connections: {
    state: ChurchConnectionState;
    church: { id: string; name: string };
  }[]
) {
  const approved = connections.filter((c) => c.state === "APPROVED");
  const grants =
    eligible &&
    approved.length &&
    (await privilegedProjectionAvailable(tx, userId))
      ? await effectiveChurchGrants(
          tx,
          userId,
          approved.map((c) => c.church.id)
        )
      : [];
  const administrators = new Set(grants.map((g) => g.churchId));
  return {
    eligible,
    connections: connections.map((c) => ({ ...c.church, state: c.state })),
    organizations: approved
      .filter((c) => administrators.has(c.church.id))
      .map((c) => c.church)
  };
}
