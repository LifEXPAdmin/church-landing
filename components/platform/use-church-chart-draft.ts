"use client";

import { useEffect, useRef, useState } from "react";
import {
  churchChartDraftKey,
  readStoredChartDraft,
  type ChartRetry,
  type StoredChartDraft
} from "@/lib/platform/church-chart-draft";
import type { ChartChange } from "@/lib/platform/church-chart-model";

type DraftValue = {
  version: number;
  changes: ChartChange[];
  retry: ChartRetry | null;
};
export function useChurchChartDraft(
  churchId: string,
  connectionId: string,
  value: DraftValue
) {
  const key = churchChartDraftKey(churchId, connectionId);
  const [recovered, setRecovered] = useState<StoredChartDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(true);
  const current = useRef({ value, recovered, ready });
  current.current = { value, recovered, ready };
  const lastWritten = useRef("");
  const discarded = useRef(false);
  function persist(override?: DraftValue) {
    if (!current.current.ready) return false;
    try {
      const saved = current.current.recovered;
      const data = override ?? current.current.value;
      if (discarded.current || (!saved && !data.changes.length)) {
        sessionStorage.removeItem(key);
        lastWritten.current = "";
      } else {
        const fingerprint = JSON.stringify(saved ?? data);
        if (fingerprint !== lastWritten.current) {
          const record = saved ?? {
            format: 1,
            churchId,
            connectionId,
            updatedAt: Date.now(),
            ...data
          };
          const raw = JSON.stringify(record);
          if (!readStoredChartDraft(raw, churchId, connectionId))
            throw new Error("Draft is unavailable");
          sessionStorage.setItem(key, raw);
          lastWritten.current = fingerprint;
        }
      }
      setAvailable(true);
      return true;
    } catch {
      setAvailable(false);
      return false;
    }
  }
  const persistRef = useRef(persist);
  persistRef.current = persist;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      const draft = readStoredChartDraft(raw, churchId, connectionId);
      if (draft) setRecovered(draft);
      else if (raw) sessionStorage.removeItem(key);
      setAvailable(true);
    } catch {
      setAvailable(false);
    }
    setReady(true);
    const flush = () => {
      persistRef.current();
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("popstate", flush, true);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("popstate", flush, true);
    };
  }, [key, churchId, connectionId]);
  useEffect(() => {
    persistRef.current();
  }, [value, recovered, ready]);
  return {
    recovered,
    ready,
    available,
    persist,
    consume: () => setRecovered(null),
    discard: () => {
      discarded.current = true;
      persistRef.current();
      setRecovered(null);
    },
    allowNewDraft: () => {
      discarded.current = false;
    }
  };
}
