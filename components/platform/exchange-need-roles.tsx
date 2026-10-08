"use client";
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode
} from "react";
import Link from "next/link";
import type { NeedRoleChoice } from "./exchange-need-forms";
import { PrivateSnapshotGuard } from "./private-snapshot-guard";
import { useReadVisibility } from "./read-visibility";

type RolePage = {
  ownerId: string;
  roles: NeedRoleChoice[];
  next: string | null;
};
const RoleChoices = createContext<NeedRoleChoice[]>([]);
export function useNeedRoleChoices() {
  return useContext(RoleChoices);
}

// The existing guard supplies only its exact verified read, without a second
// request or private role data serialized into the server's component props.
type Props = {
  owner: string;
  url: string;
  checksum: string;
  path: string;
  children: ReactNode;
};
export function ExchangeNeedRoles(props: Props) {
  return (
    <RoleReader key={JSON.stringify([props.owner, props.url])} {...props} />
  );
}
function RoleReader({ owner, url, checksum, path, children }: Props) {
  const [page, setPage] = useState<RolePage | null>(null);
  const verified = useCallback(
    (value: unknown) => {
      const data = value as RolePage;
      if (
        data?.ownerId !== owner ||
        !Array.isArray(data.roles) ||
        data.roles.length > 20 ||
        new Set(data.roles.map((r) => r?.id)).size !== data.roles.length ||
        !(
          data.next === null ||
          (typeof data.next === "string" && !!data.next)
        ) ||
        !data.roles.every(
          (r) =>
            r &&
            typeof r.id === "string" &&
            !!r.id &&
            typeof r.role === "string" &&
            typeof r.eventTitle === "string" &&
            Number.isSafeInteger(r.capacity) &&
            r.capacity > 0 &&
            typeof r.approvalRequired === "boolean" &&
            typeof r.postId === "string" &&
            typeof r.startAt === "string" &&
            Number.isFinite(Date.parse(r.startAt))
        )
      )
        throw Error("Current event role choices could not be confirmed.");
      setPage(data);
    },
    [owner]
  );
  return (
    <PrivateSnapshotGuard
      owner={owner}
      url={url}
      checksum={checksum}
      label="available event roles"
      onVerified={verified}
    >
      <RoleContents page={page} path={path}>
        {children}
      </RoleContents>
    </PrivateSnapshotGuard>
  );
}
function RoleContents({
  page,
  path,
  children
}: {
  page: RolePage | null;
  path: string;
  children: ReactNode;
}) {
  const visible = useReadVisibility();
  return (
    <RoleChoices.Provider value={page?.roles ?? []}>
      {children}
      {visible && page?.next && (
        <Link
          prefetch={false}
          className="gc-button gc-button-quiet"
          href={`${path}?rolesAfter=${encodeURIComponent(page.next)}`}
        >
          More current event roles
        </Link>
      )}
    </RoleChoices.Provider>
  );
}
