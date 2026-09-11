import type { StructureSnapshot } from "./church-structure-types";
import { positionPlacementLabel } from "./church-position-placement";

export type ChurchContactCardData = {
  person: {
    connectionId: string;
    name: string;
    email?: string;
    phone?: string;
  };
  canManage: boolean;
  roles: {
    positionId: string;
    name: string;
    description: string;
    placement: string;
    assignmentId: string;
  }[];
};

// Both initial rendering and current reads use the consent-filtered structure
// snapshot. No account/profile email, phone or image fallback is accepted.
export function churchContactCardData(
  snapshot: StructureSnapshot,
  connectionId: string
): ChurchContactCardData {
  if (
    !snapshot.person ||
    snapshot.person.connectionId !== connectionId ||
    typeof snapshot.person.name !== "string" ||
    !Array.isArray(snapshot.positions) ||
    !Array.isArray(snapshot.capabilities)
  )
    throw new Error("Current contact information is unavailable.");
  return {
    person: {
      connectionId,
      name: snapshot.person.name,
      ...(typeof snapshot.person.email === "string"
        ? { email: snapshot.person.email }
        : {}),
      ...(typeof snapshot.person.phone === "string"
        ? { phone: snapshot.person.phone }
        : {})
    },
    canManage: snapshot.capabilities.includes("MANAGE_STRUCTURE"),
    roles: snapshot.positions.flatMap((p) => {
      const assignment = p.assignments.find(
        (a) => a.connectionId === connectionId
      );
      return assignment
        ? [
            {
              positionId: p.id,
              name: p.name,
              description: p.description,
              placement: positionPlacementLabel(p, snapshot.positions),
              assignmentId: assignment.id
            }
          ]
        : [];
    })
  };
}
