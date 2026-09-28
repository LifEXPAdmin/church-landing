"use client";
import {
  createContext,
  useContext,
  useId,
  useLayoutEffect,
  useRef
} from "react";
import { useReadVisibility } from "./read-visibility";

export type PrivatePostRecovery = { busy: boolean; retry: () => void };
export type PrivatePostScope = {
  owner: string;
  concealed: boolean;
  accessVersion: () => number | null;
  refresh: () => void;
  registerWork: (id: string, protectedWork: boolean) => void;
  registerRecovery: (id: string, recovery: PrivatePostRecovery | null) => void;
};

// Opted-in readers retain their existing action owners. Only their presentation
// disappears; current owner checks still authorize every read and original retry.
export const PrivatePostWorkspace = createContext<PrivatePostScope | null>(
  null
);
export const usePrivatePostWorkspace = () => useContext(PrivatePostWorkspace);
export function usePrivatePostConcealed() {
  const scope = usePrivatePostWorkspace();
  const visible = useReadVisibility();
  return !!scope && (scope.concealed || !visible);
}
export function usePrivatePostRecovery(
  pending: boolean,
  busy: boolean,
  retry: () => void
) {
  const scope = usePrivatePostWorkspace();
  const register = scope?.registerRecovery;
  const id = useId(),
    latest = useRef(retry);
  latest.current = retry;
  useLayoutEffect(() => {
    register?.(id, pending ? { busy, retry: () => latest.current() } : null);
    return () => register?.(id, null);
  }, [id, pending, busy, register]);
}
