import type { StructureSnapshot } from "./church-structure-types";

// Only changes to the visible identity/authority projection invalidate a static
// view. Assignment IDs and chart versions can change during an uncertain save;
// those must not unmount the form and throw away its exact retry reference.
export function churchContactPrivacy(snapshot: StructureSnapshot) {
  const people = new Map<string, string>();
  for (const p of snapshot.positions)
    for (const a of p.assignments) {
      if (a.connectionId && a.name) people.set(a.connectionId, a.name);
    }
  for (const person of snapshot.candidates ?? [])
    people.set(person.id, person.name);
  for (const grant of snapshot.grants ?? []) {
    if (grant.connectionId && grant.name)
      people.set(grant.connectionId, grant.name);
  }
  return {
    churchId: snapshot.church.id,
    viewerId: snapshot.viewer.id,
    connectionId: snapshot.ownConnectionId,
    capabilities: [...snapshot.capabilities].sort(),
    people: [...people.entries()].sort(([a], [b]) => a.localeCompare(b)),
    person: snapshot.person ?? null
  };
}
