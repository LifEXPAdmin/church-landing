"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

interface InfoModalProps {
  open: boolean;
  title: string;
  summary: string;
  detail: string;
  ctaLabel: string;
  badge?: string;
  onClose: () => void;
  onContinue: () => void;
}

export function InfoModal({ open, title, summary, detail, ctaLabel, badge, onClose, onContinue }: InfoModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-3xl border border-[#f2d8af]/45 bg-[linear-gradient(160deg,#2a1d12_0%,#1b130d_100%)] p-5 text-[#f7ead5] shadow-[0_20px_70px_rgba(0,0,0,0.55)] sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            {badge ? (
              <p className="mb-2 inline-flex rounded-full border border-[#f2d8af]/35 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.12em] text-[#ffe1b6]">
                {badge}
              </p>
            ) : null}
            <p className="text-2xl leading-tight sm:text-[2rem]">{title}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full border border-[#f2d8af]/35 p-1.5 text-[#f7ead5] transition-colors hover:bg-white/10"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm text-[#f4e4ca] sm:text-base">{summary}</p>
        <p className="mt-2 text-sm leading-relaxed text-[#edd9bb] sm:text-base">{detail}</p>

        <div className="mt-6">
          <Button className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]" onClick={onContinue}>
            {ctaLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
