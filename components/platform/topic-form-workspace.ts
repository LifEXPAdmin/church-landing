"use client";
import { createContext } from "react";

export type TopicFormWork = {
  protectedWork: boolean;
  pending: boolean;
  busy: boolean;
  retry: () => void;
};
// Opt-in management coordination. Other Topic forms keep their existing owner.
export const TopicFormWorkspace = createContext<{
  concealed: boolean;
  register: (id: string, work: TopicFormWork | null) => void;
  accessVersion: () => number | null;
  denied: (generation: number | null | undefined) => void;
  saved: () => void;
} | null>(null);
