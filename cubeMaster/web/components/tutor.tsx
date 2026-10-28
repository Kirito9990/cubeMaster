"use client";

import type {
  CoachComment,
  ColorCrossSummary,
  ColorMode,
  CrossColorName,
  InsertionHighlight,
  OrientationResult,
  PairCard,
  Route,
} from "@/lib/types";

export const COLOR_SWATCH: Record<string, { dot: string; bg: string; ring: string; label: string }> = {
  white:  { dot: "bg-white border border-slate-400", bg: "bg-slate-100/10", ring: "ring-slate-200/50", label: "白底" },
  yellow: { dot: "bg-yellow-300", bg: "bg-yellow-400/10", ring: "ring-yellow-400/50", label: "黄底" },
  green:  { dot: "bg-emerald-500", bg: "bg-emerald-500/10", ring: "ring-emerald-400/50", label: "绿底" },
  blue:   { dot: "bg-sky-500", bg: "bg-sky-500/10", ring: "ring-sky-400/50", label: "蓝底" },
  red:    { dot: "bg-rose-500", bg: "bg-rose-500/10", ring: "ring-rose-400/50", label: "红底" },
  orange: { dot: "bg-orange-500", bg: "bg-orange-500/10", ring: "ring-orange-400/50", label: "橙底" },
};

const FRONT_COLORS: Record<string, string> = {
  green: "bg-emerald-500",
  blue: "bg-sky-500",
  red: "bg-rose-500",
  orange: "bg-orange-500",
  white: "bg-white",
  yellow: "bg-yellow-300",
};

export function Alg({ children, className = "" }: { children: string; className?: string }) {
  return (
    <code className={`rounded-md bg-black/40 px-1.5 py-0.5 font-mono text-[0.92em] text-sky-200 ${className}`}>
      {children || "∅"}
    </code>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "emerald" | "violet" | "amber" | "rose" | "sky" | "slate";
  children: React.ReactNode;
}) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    sky: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    slate: "bg-slate-500/15 text-slate-300 ring-slate-400/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function ColorNeutralitySelector({
  colorMode,
  customColors,
  onChangeMode,
  onToggleCustomColor,
}: {
  colorMode: ColorMode;
  customColors: CrossColorName[];
  onChangeMode: (m: ColorMode) => void;
  onToggleCustomColor: (c: CrossColorName) => void;
}) {
  const modes: { id: ColorMode; label: string; desc: string }[] = [
    { id: "white", label: "单色 (白底)", desc: "传统 z2 白十字" },
    { id: "dual", label: "双色 (白/黄底)", desc: "WCA 主流双色中立" },
    { id: "full", label: "六色全中立 (CN)", desc: "全 6 底色 24 朝向全局寻优" },
    { id: "custom", label: "自选底色", desc: "自由勾选任意底色组合" },
  ];

  const allColors: CrossColorName[] = ["white", "yellow", "green", "blue", "red", "orange"];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">🎨 色向中立模式 (Color Neutrality):</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {modes.map((m) => {
            const active = colorMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => onChangeMode(m.id)}
                title={m.desc}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "bg-sky-500 text-white shadow-sm shadow-sky-500/30"
                    : "border border-slate-700/80 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:bg-slate-800"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {colorMode === "custom" && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <span className="text-xs text-slate-400">勾选要对比的底色:</span>
          {allColors.map((col) => {
            const sw = COLOR_SWATCH[col];
            const checked = customColors.includes(col);
            return (
              <button
                key={col}
                onClick={() => onToggleCustomColor(col)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  checked
                    ? "border-sky-400 bg-sky-500/20 text-white"
                    : "border-slate-800 bg-slate-950/60 text-slate-500 hover:border-slate-700"
                }`}
              >
                <span className={`h-2.5 w-2.5 rounded-full ${sw.dot}`} />
                <span>{sw.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ColorRankingCards({
  summaries,
  activeColor,
  onSelectColor,
}: {
  summaries: ColorCrossSummary[];
  activeColor: CrossColorName;
  onSelectColor: (c: CrossColorName) => void;
}) {
  if (summaries.length <= 1) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
      {summaries.map((s) => {
        const active = s.cross_color === activeColor;
        const sw = COLOR_SWATCH[s.cross_color] ?? COLOR_SWATCH.white;
        return (
          <button
            key={s.cross_color}
            onClick={() => onSelectColor(s.cross_color)}
            className={`flex flex-col justify-between rounded-xl border p-3 text-left transition ${
              active
                ? "border-sky-500 bg-sky-500/15 ring-1 ring-sky-500/50"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${sw.dot}`} />
                <span className="text-sm font-bold text-slate-100">{s.cross_color_label}</span>
                {s.rank === 1 && <Badge tone="emerald">全场最佳</Badge>}
              </div>
              <span className="text-xs font-mono text-slate-400">#{s.rank}</span>
            </div>
            <div className="mt-2 flex items-baseline justify-between w-full text-xs">
              <span className="text-slate-400">
                十字 <strong className="text-slate-200">{s.optimal_cross_moves}</strong>步 · 首组{" "}
                <strong className="text-slate-200">{s.best_slot}</strong>
                {s.best_slot_moves ? `(${s.best_slot_moves}步)` : ""}
              </span>
              <span className="font-bold text-sky-400">{s.best_total_score}分</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function CoachCard({ coach, loading }: { coach: CoachComment | null; loading?: boolean }) {
  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-xs font-semibold text-sky-300">AI 复盘教练点评</span>
          {coach?.kind === "color_neutral" && <Badge tone="sky">色向中立优选</Badge>}
          {coach?.kind === "insertion" && <Badge tone="amber">AUF 插入高亮</Badge>}
        </div>
        {coach && (
          <span className="text-[10px] text-slate-400">
            {coach.source === "llm" ? `LLM (${coach.model ?? "deepseek"})` : "专家规则引擎"}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-slate-200">
        {loading ? "教练正在生成深度点评..." : coach?.text ?? "准备完毕"}
      </p>
    </div>
  );
}

export function OrientationRanking({
  orientations,
  activeRotation,
  onSelect,
}: {
  orientations: OrientationResult[];
  activeRotation: string;
  onSelect: (rot: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {orientations.map((o) => {
        const active = o.rotation === activeRotation;
        const colorClass = FRONT_COLORS[o.front_color] ?? "bg-slate-400";
        return (
          <button
            key={o.rotation}
            onClick={() => onSelect(o.rotation)}
            className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
              active
                ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/50"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300">
                #{o.rank}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${colorClass}`} />
                  <span className="text-sm font-semibold text-slate-100">{o.label}</span>
                  <span className="font-mono text-xs text-slate-400">({o.inspection_alg || "原位"})</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  十字最优 <strong className="text-slate-200">{o.optimal_cross_moves}</strong> 步 · 首组{" "}
                  <strong className="text-slate-200">{o.best_route.first_pair.slot}</strong>
                </div>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400">综合分</span>
              <div className="text-sm font-bold text-sky-400">{o.best_route.total_score}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function RouteSummary({
  routes,
  activeIndex,
  onSelect,
}: {
  routes: Route[];
  activeIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div className="space-y-2">
      {routes.map((r, i) => {
        const active = i === activeIndex;
        const fp = r.first_pair;
        return (
          <div
            key={i}
            onClick={() => onSelect(i)}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              active
                ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40"
                : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">解法 #{i + 1}</span>
                <Badge tone="sky">十字 {r.cross_moves} 步</Badge>
                {fp.rul_alg && <Badge tone="emerald">首组 {fp.slot} {fp.rul_moves} 步</Badge>}
              </div>
              <span className="text-xs font-semibold text-sky-400">综合分: {r.total_score}</span>
            </div>
            <div className="mt-2 font-mono text-xs text-slate-300">
              十字公式: <Alg>{r.cross}</Alg>
            </div>
            {fp.rul_alg && (
              <div className="mt-1 font-mono text-xs text-slate-400">
                推荐首组: <Alg>{fp.rul_alg}</Alg> ({fp.summary})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function PairCards({
  pairs,
  activeSlot,
  onPlay,
}: {
  pairs: PairCard[];
  activeSlot: string | null;
  onPlay: (p: PairCard) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {pairs.map((p) => {
        const active = p.slot === activeSlot;
        const toneMap: Record<PairCard["category"], "emerald" | "amber" | "violet" | "rose"> = {
          excellent: "emerald",
          comfortable: "amber",
          stuck: "violet",
          bad_eo: "rose",
        };

        return (
          <div
            key={p.slot}
            onClick={() => onPlay(p)}
            className={`cursor-pointer rounded-xl border p-3.5 transition ${
              active
                ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/40"
                : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-100">{p.slot_label}</span>
                <Badge tone={toneMap[p.category]}>{p.summary}</Badge>
              </div>
              {p.rul_moves && <span className="text-xs text-slate-400">{p.rul_moves} 步</span>}
            </div>

            <div className="mt-2 font-mono text-xs text-slate-300">
              直插公式: <Alg>{p.rul_alg || "无 RUL/直插方案"}</Alg>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] text-slate-400">
              <span className="rounded bg-slate-800 px-1.5 py-0.5">角块: {p.corner_location}</span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5">棱块: {p.edge_location}</span>
              {p.edge_good_eo && <span className="rounded bg-emerald-950 text-emerald-300 px-1.5 py-0.5">Good EO</span>}
              {p.is_back_slot && <span className="rounded bg-sky-950 text-sky-300 px-1.5 py-0.5">后槽位</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function InsertionCards({
  highlights,
  onPlay,
}: {
  highlights: InsertionHighlight[];
  onPlay: (h: InsertionHighlight) => void;
}) {
  return (
    <div className="space-y-3">
      {highlights.map((h, i) => (
        <div
          key={i}
          onClick={() => onPlay(h)}
          className="cursor-pointer rounded-xl border border-amber-500/30 bg-amber-950/10 p-3.5 hover:border-amber-500/60 transition"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge tone="amber">{h.cross_color_label} · UF 插入 {h.auf}</Badge>
              <span className="text-xs font-semibold text-slate-200">优化 {h.slot_label} 首组 ({h.orientation_label})</span>
            </div>
            <span className="text-xs text-amber-300 font-mono">
              原 {h.before_moves} 步 → 优化后 {h.after_moves} 步
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-300 font-mono">
            插入调整: <Alg>{h.auf}</Alg> · 新十字尾步: <Alg>{h.final_move}</Alg>
          </div>
          <div className="mt-1 text-xs text-slate-400 font-mono">
            接续直插: <Alg>{h.after_alg}</Alg>
          </div>
        </div>
      ))}
    </div>
  );
}
