"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { trackClientEvent } from "@/lib/client-analytics";

interface TracePoint {
  x: number;
  y: number;
}

const CHECKPOINTS = [
  { x: 55, y: 20 },
  { x: 55, y: 42 },
  { x: 55, y: 64 },
  { x: 40, y: 42 },
  { x: 70, y: 42 }
] as const;

export function FaithTraceGame() {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [points, setPoints] = useState<TracePoint[]>([]);
  const [hitCheckpoints, setHitCheckpoints] = useState<Set<number>>(new Set());
  const [interactionTracked, setInteractionTracked] = useState(false);
  const [completionTracked, setCompletionTracked] = useState(false);

  const progress = hitCheckpoints.size;
  const completed = progress === CHECKPOINTS.length;

  function handleDraw(event: React.PointerEvent<HTMLDivElement>) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    setPoints((previous) => {
      const next = [...previous, { x, y }];
      return next.slice(-26);
    });

    if (!interactionTracked) {
      setInteractionTracked(true);
      trackClientEvent({
        eventType: "CTA_CLICK",
        path: "/",
        label: "easter:start-trace"
      });
    }

    setHitCheckpoints((previous) => {
      const next = new Set(previous);
      CHECKPOINTS.forEach((checkpoint, index) => {
        if (next.has(index)) {
          return;
        }

        const dx = ((x - checkpoint.x) * rect.width) / 100;
        const dy = ((y - checkpoint.y) * rect.height) / 100;
        if (Math.hypot(dx, dy) <= 28) {
          next.add(index);
        }
      });
      return next;
    });
  }

  useEffect(() => {
    if (!completed || completionTracked) {
      return;
    }

    setCompletionTracked(true);
    trackClientEvent({
      eventType: "CTA_CLICK",
      path: "/",
      label: "easter:reveal-cross"
    });
  }, [completed, completionTracked]);

  const pathData = useMemo(() => {
    if (points.length === 0) {
      return "";
    }

    return points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(" ");
  }, [points]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <div
        ref={boardRef}
        className="pointer-events-auto absolute right-2 top-20 h-[220px] w-[260px] rounded-3xl border border-white/10 bg-black/5 backdrop-blur-[1px] sm:right-6 sm:top-20 sm:h-[280px] sm:w-[340px] md:right-8 md:top-20 md:h-[360px] md:w-[480px]"
        onPointerDown={handleDraw}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {pathData ? (
            <>
              <path d={pathData} stroke="rgba(252, 198, 121, 0.25)" strokeWidth="1.4" fill="none" />
              <path d={pathData} stroke="rgba(247, 211, 165, 0.78)" strokeWidth="0.56" fill="none" />
            </>
          ) : null}

          {points.map((point, index) => (
            <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r="0.82" fill="rgba(251, 224, 184, 0.65)" />
          ))}

          {CHECKPOINTS.map((checkpoint, index) => {
            const isLit = hitCheckpoints.has(index);
            return (
              <circle
                key={`${checkpoint.x}-${checkpoint.y}`}
                cx={checkpoint.x}
                cy={checkpoint.y}
                r={isLit ? 2.2 : 1.5}
                fill={isLit ? "rgba(252, 220, 162, 0.95)" : "rgba(248, 222, 181, 0.22)"}
              />
            );
          })}

          {completed ? (
            <>
              <line x1="55" y1="20" x2="55" y2="64" stroke="rgba(252, 224, 170, 0.9)" strokeWidth="1.2" />
              <line x1="40" y1="42" x2="70" y2="42" stroke="rgba(252, 224, 170, 0.9)" strokeWidth="1.2" />
            </>
          ) : null}
        </svg>

        <div className="pointer-events-none absolute inset-x-3 bottom-3">
          {completed ? (
            <p className="inline-flex items-center gap-1 rounded-full border border-[#f2d8af]/35 bg-black/35 px-3 py-1 text-[11px] text-[#ffe6be]">
              <Sparkles className="h-3 w-3" />
              You found the hidden sign
            </p>
          ) : (
            <p className="text-[11px] text-[#f8dfba]/70">{points.length === 0 ? "Hint: connect the lights" : `Progress ${progress}/${CHECKPOINTS.length}`}</p>
          )}
        </div>

        <button
          type="button"
          className="absolute right-2 top-2 rounded-full border border-[#f2d8af]/30 bg-black/30 px-2 py-1 text-[11px] text-[#f5ddb8] transition-colors hover:bg-black/45"
          onClick={() => {
            setPoints([]);
            setHitCheckpoints(new Set());
            setCompletionTracked(false);
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
