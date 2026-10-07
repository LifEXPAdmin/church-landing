/** Local persistence only. Canonical transport owns authentication and revocation. */
export type Credential = Readonly<{ ownerId: string; token: string }>;
export type CredentialBinding = Readonly<{
  scope: string;
  installationId: string;
  credentialId: string;
  ownerId: string;
}>;
/** Never publish this as an authenticated session before server verification. */
export type CredentialCandidate = Readonly<CredentialBinding & Credential>;
export type GenerationTicket = Readonly<{ isCurrent(): boolean }>;
export type TextStore = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
};
export type VaultPorts = {
  marker: TextStore;
  secret: TextStore;
  randomId(): string;
};
export type CandidateResult =
  | { status: "candidate"; candidate: CredentialCandidate }
  | { status: "empty"; cleanupPending: boolean }
  | { status: "locked" | "invalid" }
  | { status: "stale" | "unavailable"; cleanup?: ClearResult["status"] };
export type ClearResult = {
  status: "cleared" | "cleanup-pending" | "unconfirmed" | "superseded";
};

export const MARKER_MAX_LENGTH = 256;
export const SECRET_MAX_LENGTH = 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const owner = /^[A-Za-z0-9_-]{1,100}$/;
const bearer = /^[A-Za-z0-9_-]{43}$/;
type Marker = {
  version: 1;
  installationId: string;
  credentialId: string | null;
  phase: "pending" | "active" | "signed-out";
};

function record(raw: string | null, max: number): Record<string, unknown> | null {
  if (!raw || raw.length > max) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
  } catch { return null; }
}
function hasKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function parseMarker(raw: string | null): Marker | null {
  const value = record(raw, MARKER_MAX_LENGTH);
  if (!value || !hasKeys(value, ["version", "installationId", "credentialId", "phase"]) ||
      value.version !== 1 || typeof value.installationId !== "string" || !uuid.test(value.installationId)) return null;
  if (value.phase === "signed-out" && value.credentialId === null) return value as Marker;
  return (value.phase === "pending" || value.phase === "active") &&
    typeof value.credentialId === "string" && uuid.test(value.credentialId) ? value as Marker : null;
}
function validCredential(value: Credential): boolean {
  return typeof value.ownerId === "string" && owner.test(value.ownerId) &&
    typeof value.token === "string" && bearer.test(value.token);
}
function parseSecret(raw: string | null, scope: string): CredentialCandidate | null {
  const value = record(raw, SECRET_MAX_LENGTH);
  if (!value || !hasKeys(value, ["version", "scope", "installationId", "credentialId", "ownerId", "token"]) ||
      value.version !== 1 || value.scope !== scope ||
      typeof value.installationId !== "string" || !uuid.test(value.installationId) ||
      typeof value.credentialId !== "string" || !uuid.test(value.credentialId) ||
      !validCredential(value as Credential)) return null;
  const { version: _version, ...candidate } = value;
  return Object.freeze(candidate) as CredentialCandidate;
}
function matchesMarker(marker: Marker, binding: CredentialBinding): boolean {
  return marker.installationId === binding.installationId && marker.credentialId === binding.credentialId;
}
export function sameCredential(a: CredentialBinding, b: CredentialBinding): boolean {
  return a.scope === b.scope && a.ownerId === b.ownerId &&
    a.installationId === b.installationId && a.credentialId === b.credentialId;
}
function current(ticket: GenerationTicket): boolean {
  try { return ticket.isCurrent(); } catch { return false; }
}

/** One instance is the sole writer for a fixed app/environment namespace. */
export function createCredentialVault(scope: string, ports: VaultPorts) {
  if (!/^[\x21-\x7e]{1,256}$/.test(scope)) throw new Error("Invalid credential scope.");
  let tail: Promise<unknown> = Promise.resolve();
  let restorationLocked = false;
  let observed: CredentialBinding | null = null;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  }
  function randomId(): string {
    const id = ports.randomId();
    if (!uuid.test(id)) throw new Error("Secure identifier unavailable.");
    return id;
  }
  async function writeChecked(store: TextStore, value: string): Promise<void> {
    await store.write(value);
    if (await store.read() !== value) throw new Error("Storage verification failed.");
  }
  // Run only inside the queue. Even a superseded logout intent must be persisted
  // before a later login can commit. Never gate these effects on a UI generation.
  async function invalidate(installationId?: string): Promise<ClearResult> {
    let markerDisabled = false;
    let secretRemoved = false;
    try {
      const tombstone: Marker = { version: 1, installationId: installationId ?? randomId(), credentialId: null, phase: "signed-out" };
      await writeChecked(ports.marker, JSON.stringify(tombstone));
      markerDisabled = true;
    } catch { /* Still attempt secret removal when the marker store fails. */ }
    try {
      await ports.secret.remove();
      secretRemoved = await ports.secret.read() === null;
    } catch { /* A successful marker still prevents restoration. */ }
    observed = null;
    return { status: secretRemoved ? "cleared" : markerDisabled ? "cleanup-pending" : "unconfirmed" };
  }
  async function staleReplacement(installationId: string): Promise<CandidateResult> {
    const cleanup = await invalidate(installationId);
    return { status: "stale", cleanup: cleanup.status };
  }

  return {
    readCandidate(ticket: GenerationTicket): Promise<CandidateResult> {
      return enqueue(async () => {
        if (!current(ticket)) return { status: "stale" };
        if (restorationLocked) return { status: "locked" };
        try {
          const markerRaw = await ports.marker.read();
          if (!current(ticket)) return { status: "stale" };
          if (restorationLocked) return { status: "locked" };
          const secretRaw = await ports.secret.read();
          if (!current(ticket)) return { status: "stale" };
          if (restorationLocked) return { status: "locked" };
          // The OS may evict the cache marker during an asynchronous Keychain
          // read. Match a fresh marker before returning even a candidate.
          const confirmedMarkerRaw = await ports.marker.read();
          if (!current(ticket)) return { status: "stale" };
          if (restorationLocked) return { status: "locked" };
          const marker = confirmedMarkerRaw === markerRaw ? parseMarker(markerRaw) : null;
          const candidate = parseSecret(secretRaw, scope);
          if (marker?.phase === "active" && candidate && matchesMarker(marker, candidate)) {
            observed = candidate;
            return { status: "candidate", candidate };
          }
          if (markerRaw === null && confirmedMarkerRaw === null && secretRaw === null) return { status: "empty", cleanupPending: false };
          restorationLocked = true;
          const cleanup = await invalidate(marker?.installationId);
          if (!current(ticket)) return { status: "stale", cleanup: cleanup.status };
          return cleanup.status === "unconfirmed" ? { status: "unavailable", cleanup: cleanup.status } :
            { status: "empty", cleanupPending: cleanup.status === "cleanup-pending" };
        } catch { return { status: "unavailable" }; }
      });
    },

    replace(ticket: GenerationTicket, credential: Credential): Promise<CandidateResult> {
      if (!current(ticket)) return Promise.resolve({ status: "stale" });
      if (!validCredential(credential)) return Promise.resolve({ status: "invalid" });
      // Snapshot input before awaiting; the caller cannot mutate a queued secret.
      const input = { ownerId: credential.ownerId, token: credential.token };
      restorationLocked = true;
      return enqueue(async () => {
        if (!current(ticket)) return { status: "stale" };
        let installationId: string | undefined;
        try {
          const marker = parseMarker(await ports.marker.read());
          if (!current(ticket)) return { status: "stale" };
          installationId = marker?.installationId ?? randomId();
          const candidate = Object.freeze({ ...input, scope, installationId, credentialId: randomId() });
          const pending: Marker = { version: 1, installationId, credentialId: candidate.credentialId, phase: "pending" };
          await writeChecked(ports.marker, JSON.stringify(pending));
          if (!current(ticket)) return staleReplacement(installationId);
          await writeChecked(ports.secret, JSON.stringify({ version: 1, ...candidate }));
          if (!current(ticket)) return staleReplacement(installationId);
          await writeChecked(ports.marker, JSON.stringify({ ...pending, phase: "active" }));
          if (!current(ticket)) return staleReplacement(installationId);
          observed = candidate;
          restorationLocked = false;
          return { status: "candidate", candidate };
        } catch {
          // Never roll back to a previous active marker after a partial replace.
          const cleanup = await invalidate(installationId);
          return { status: current(ticket) ? "unavailable" : "stale", cleanup: cleanup.status };
        }
      });
    },

    /** Call immediately on local logout, before any remote await. Delayed
     * revocation cleanup MUST supply the original binding, including its nonce. */
    clear(expected?: CredentialBinding): Promise<ClearResult> {
      const binding = expected ? { ...expected } : null;
      if (!binding || !observed || sameCredential(observed, binding)) restorationLocked = true;
      return enqueue(async () => {
        if (binding) {
          let marker: Marker | null = null;
          try {
            if (binding.scope !== scope) return { status: "superseded" };
            marker = parseMarker(await ports.marker.read());
            if (marker?.credentialId && !matchesMarker(marker, binding)) return { status: "superseded" };
            const secretRaw = await ports.secret.read();
            const secret = parseSecret(secretRaw, scope);
            if (secret && !sameCredential(secret, binding)) return { status: "superseded" };
            // An unreadable record cannot be attributed to this delayed callback.
            if (secretRaw !== null && !secret) {
              return marker && matchesMarker(marker, binding) ? invalidate(binding.installationId) : { status: "unconfirmed" };
            }
          } catch {
            // A matching random binding can be tombstoned even if Keychain is
            // temporarily unreadable. Never apply this fallback to a new nonce.
            if ((marker && matchesMarker(marker, binding)) || (observed && sameCredential(observed, binding))) {
              return invalidate(binding.installationId);
            }
            return { status: "unconfirmed" };
          }
        }
        restorationLocked = true;
        return invalidate(binding?.installationId);
      });
    }
  };
}
