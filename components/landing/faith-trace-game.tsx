"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cross, RotateCcw, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { trackClientEvent } from "@/lib/client-analytics";

type PointId = "tl" | "tc" | "tr" | "cl" | "cc" | "cr" | "bl" | "bc" | "br";

interface Point {
  id: PointId;
  x: number;
  y: number;
  row: number;
  col: number;
}

const POINTS: Point[] = [
  { id: "tl", x: 14, y: 14, row: 0, col: 0 },
  { id: "tc", x: 50, y: 14, row: 0, col: 1 },
  { id: "tr", x: 86, y: 14, row: 0, col: 2 },
  { id: "cl", x: 14, y: 50, row: 1, col: 0 },
  { id: "cc", x: 50, y: 50, row: 1, col: 1 },
  { id: "cr", x: 86, y: 50, row: 1, col: 2 },
  { id: "bl", x: 14, y: 86, row: 2, col: 0 },
  { id: "bc", x: 50, y: 86, row: 2, col: 1 },
  { id: "br", x: 86, y: 86, row: 2, col: 2 }
];

const POINTS_BY_ID = Object.fromEntries(POINTS.map((point) => [point.id, point])) as Record<PointId, Point>;

function edgeKey(a: PointId, b: PointId) {
  return [a, b].sort().join(":");
}

const TARGET_EDGES = new Set<string>([
  edgeKey("tc", "cc"),
  edgeKey("cc", "bc"),
  edgeKey("cl", "cc"),
  edgeKey("cc", "cr")
]);

function isAdjacent(a: PointId, b: PointId) {
  const pointA = POINTS_BY_ID[a];
  const pointB = POINTS_BY_ID[b];
  const rowDiff = Math.abs(pointA.row - pointB.row);
  const colDiff = Math.abs(pointA.col - pointB.col);
  return rowDiff + colDiff === 1;
}

export function FaithTraceGame() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activePoint, setActivePoint] = useState<PointId | null>(null);
  const [edges, setEdges] = useState<Set<string>>(new Set());
  const [moves, setMoves] = useState(0);
  const [completionTracked, setCompletionTracked] = useState(false);

  const progress = useMemo(() => Array.from(TARGET_EDGES).filter((target) => edges.has(target)).length, [edges]);
  const completed = progress === TARGET_EDGES.size;

  useEffect(() => {
    if (!completed || completionTracked) {
      return;
    }

    setCompletionTracked(true);
    trackClientEvent({
      eventType: "CTA_CLICK",
      path: "/",
      label: "easter:complete"
    });
  }, [completed, completionTracked]);

  function resetBoard() {
    setActivePoint(null);
    setEdges(new Set());
    setMoves(0);
    setCompletionTracked(false);
  }

  function handleOpen() {
    setOpen(true);
    trackClientEvent({
      eventType: "CTA_CLICK",
      path: "/",
      label: "easter:open"
    });
  }

  function handlePointClick(id: PointId) {
    if (!activePoint) {
      setActivePoint(id);
      return;
    }

    if (activePoint === id) {
      setActivePoint(null);
      return;
    }

    if (!isAdjacent(activePoint, id)) {
      setActivePoint(id);
      return;
    }

    const nextKey = edgeKey(activePoint, id);
    setEdges((previous) => {
      const next = new Set(previous);
      next.add(nextKey);
      return next;
    });
    setMoves((previous) => previous + 1);
    setActivePoint(id);
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-[#f2d8af]/45 bg-black/20 px-3 py-1 text-xs text-[#f7e6cb] transition-colors hover:bg-black/35"
        onClick={handleOpen}
      >
        <Cross className="h-3.5 w-3.5" />
        <span>Find the cross</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl rounded-3xl border border-[#f2d8af]/45 bg-[linear-gradient(160deg,#2a1d12_0%,#18100a_100%)] p-5 text-[#f7ead5] shadow-[0_20px_70px_rgba(0,0,0,0.6)] sm:p-7"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-1 rounded-full border border-[#f2d8af]/35 bg-black/20 px-3 py-1 text-xs uppercase tracking-[0.12em] text-[#ffe1b6]">
                  Easter Egg
                </p>
                <h3 className="mt-3 text-3xl">Trace the Cross</h3>
              </div>
              <button
                type="button"
                aria-label="Close"
                className="rounded-full border border-[#f2d8af]/35 p-1.5 text-[#f7ead5] transition-colors hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-sm text-[#f4e4ca] sm:text-base">
              Tap one dot, then connect adjacent dots to form a cross. Complete all four cross lines to finish.
            </p>

            <div className="mt-5 rounded-2xl border border-[#f2d8af]/35 bg-black/20 p-3 sm:p-4">
              <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[300px]">
                {Array.from(edges).map((edge) => {
                  const [a, b] = edge.split(":") as [PointId, PointId];
                  const start = POINTS_BY_ID[a];
                  const end = POINTS_BY_ID[b];
                  const isTarget = TARGET_EDGES.has(edge);

                  return (
                    <line
                      key={edge}
                      x1={start.x}
                      y1={start.y}
                      x2={end.x}
                      y2={end.y}
                      stroke={isTarget ? "#f5ce94" : "#bda37c"}
                      strokeWidth={isTarget ? 3.4 : 2.6}
                      strokeLinecap="round"
                    />
                  );
                })}

                {POINTS.map((point) => {
                  const isActive = activePoint === point.id;
                  return (
                    <g key={point.id}>
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={isActive ? 4.8 : 4}
                        fill={isActive ? "#f5ce94" : "#f6e7ce"}
                        stroke="#2f2115"
                        strokeWidth={1.3}
                        className="cursor-pointer"
                        onClick={() => handlePointClick(point.id)}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-[#f5dfbd]">
                Progress: {progress}/{TARGET_EDGES.size} lines
              </p>
              <p className="text-[#ecd2ab]">Moves: {moves}</p>
            </div>

            {completed ? (
              <div className="mt-4 rounded-xl border border-[#f2d8af]/35 bg-[#c38a45]/20 px-4 py-3 text-sm text-[#ffebc9]">
                <p className="inline-flex items-center gap-2 font-semibold">
                  <Sparkles className="h-4 w-4" />
                  Cross completed. You found the hidden game.
                </p>
              </div>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                className="rounded-full bg-[#c38a45] text-white hover:bg-[#aa7537]"
                onClick={() => {
                  trackClientEvent({
                    eventType: "CTA_CLICK",
                    path: "/",
                    label: "easter:join"
                  });
                  router.push("/join?source=easter-egg");
                }}
              >
                Continue to join
              </Button>
              <Button
                variant="secondary"
                className="rounded-full border border-[#f2d8af]/35 bg-transparent text-[#f7ead5] hover:bg-white/10"
                onClick={resetBoard}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset board
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
