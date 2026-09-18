"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";

type Edit = { id: string; label: string };
const Context = createContext<{
  active: Edit | null;
  claim: (id: string, label: string) => boolean;
  release: (id: string) => void;
} | null>(null);

// A confirmed save refreshes versioned sibling forms. Finish one section
// before editing another so that refresh cannot discard independent local work.
export function PrivateEditScope({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Edit | null>(null);
  const current = useRef<Edit | null>(null);
  const claim = useCallback((id: string, label: string) => {
    if (current.current && current.current.id !== id) return false;
    if (!current.current) {
      current.current = { id, label };
      setActive(current.current);
    }
    return true;
  }, []);
  const release = useCallback((id: string) => {
    if (current.current?.id !== id) return;
    current.current = null;
    setActive(null);
  }, []);
  return (
    <Context.Provider value={{ active, claim, release }}>
      {children}
    </Context.Provider>
  );
}

export function usePrivateEdit(label: string) {
  const scope = useContext(Context),
    id = useId();
  if (!scope) throw new Error("Private editing requires its page scope");
  const { active, claim, release } = scope;
  useEffect(() => () => release(id), [id, release]);
  const blocked = !!active && active.id !== id;
  return {
    blocked,
    editing: active?.id === id,
    claim: () => claim(id, label),
    release: () => release(id),
    notice: blocked ? (
      <p role="status">
        Save or discard your edits in {active.label} before changing another
        section.
      </p>
    ) : null
  };
}
