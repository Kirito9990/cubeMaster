import type { InsertionHighlight, OrientationResult, PairCard, PlaybackSelection, Route } from "./types";

export function routePlayback(
  scramble: string,
  orientation: OrientationResult,
  route: Route,
  pair: PairCard | null = route.first_pair,
): PlaybackSelection {
  const segments: PlaybackSelection["segments"] = [
    { label: "观察转体", alg: orientation.inspection_alg, tone: "rotation" },
    { label: `十字 ${route.cross_moves} 步`, alg: route.cross, tone: "cross" },
  ];
  if (pair?.rul_alg) {
    segments.push({ label: `首组 ${pair.slot} ${pair.rul_moves} 步`, alg: pair.rul_alg, tone: "pair" });
  }
  return {
    title: `${orientation.label} · ${pair?.rul_alg ? `十字 + ${pair.slot}` : "十字"}`,
    setupAlg: scramble,
    segments: segments.filter((s) => s.alg.trim().length > 0),
  };
}

export function highlightPlayback(scramble: string, h: InsertionHighlight): PlaybackSelection {
  const prefix = h.original_cross.split(" ").slice(0, -1).join(" ");
  const segments: PlaybackSelection["segments"] = [
    { label: "观察转体", alg: ["z2", h.rotation].filter(Boolean).join(" "), tone: "rotation" },
    { label: "十字前段", alg: prefix, tone: "cross" },
    { label: `插入 ${h.auf}`, alg: h.auf, tone: "auf" },
    { label: "十字收尾", alg: h.final_move, tone: "cross" },
    { label: `${h.slot} ${h.after_moves} 步直插`, alg: h.after_alg, tone: "pair" },
  ];
  return {
    title: `${h.orientation_label} · ${h.auf} 插入优化 → ${h.slot}`,
    setupAlg: scramble,
    segments: segments.filter((s) => s.alg.trim().length > 0),
  };
}

export const playbackAlg = (p: PlaybackSelection) => p.segments.map((s) => s.alg).join(" ");
