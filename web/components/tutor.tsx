"use client";

import type { CoachComment, InsertionHighlight, OrientationResult, PairCard, Route } from "@/lib/types";

const FRONT_COLORS: Record<string, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
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

function Badge({ tone, children }: { tone: "emerald" | "violet" | "amber" | "rose" | "sky" | "slate"; children: React.ReactNode }) {
  const tones = {
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-400/30",
    sky: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    slate: "bg-slate-500/15 text-slate-300 ring-slate-400/20",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">{title}</h2>
        {aside && <div className="text-xs text-slate-400">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export function CoachCard({ coach, loading }: { coach: CoachComment; loading: boolean }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-500/15 via-fuchsia-500/10 to-sky-500/10 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-violet-200">🎙 AI 教练复盘</span>
        {coach.kind === "insertion" ? <Badge tone="amber">U/U&apos; 插入优化</Badge> : <Badge tone="slate">C+1 总评</Badge>}
        {coach.source === "llm" ? (
          <Badge tone="violet">LLM · {coach.model}</Badge>
        ) : (
          <Badge tone="slate">离线模板</Badge>
        )}
        {loading && <span className="animate-pulse text-xs text-violet-200/70">LLM 生成中…</span>}
      </div>
      <p className="text-[15px] leading-7 text-slate-100">{coach.text}</p>
      {coach.fallback_reason && coach.fallback_reason !== "no_api_key" && (
        <p className="mt-1 text-xs text-slate-400">已回退到模板：{coach.fallback_reason}</p>
      )}
    </div>
  );
}

export function OrientationRanking({
  orientations,
  selected,
  onSelect,
}: {
  orientations: OrientationResult[];
  selected: string;
  onSelect: (rotation: string) => void;
}) {
  const max = Math.max(...orientations.map((o) => o.best_route.total_score), 1);
  return (
    <div className="grid gap-2">
      {orientations.map((o) => {
        const r = o.best_route;
        const p = r.first_pair;
        const active = o.rotation === selected;
        return (
          <button
            key={o.rotation || "none"}
            type="button"
            onClick={() => onSelect(o.rotation)}
            className={`group grid grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
              active ? "border-emerald-400/50 bg-emerald-400/10" : "border-white/5 bg-black/20 hover:border-white/15"
            }`}
          >
            <span className={`text-lg font-bold ${o.rank === 1 ? "text-emerald-300" : "text-slate-500"}`}>#{o.rank}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <span className={`h-3 w-3 rounded-sm ${FRONT_COLORS[o.front_color]}`} />
                {o.label}
                <span className="text-xs text-slate-400">十字 {o.optimal_cross_moves} 步</span>
              </span>
              <span className="mt-1 block truncate text-xs text-slate-400">
                <span className="font-mono text-slate-300">{r.cross || "∅"}</span>
                {" → "}
                {p.rul_alg ? (
                  <>
                    {p.slot} {p.rul_moves} 步 <span className="font-mono text-slate-300">{p.rul_alg}</span>
                  </>
                ) : (
                  "四槽 Bad EO"
                )}
              </span>
              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-white/5">
                <span
                  className={`block h-full rounded-full ${o.rank === 1 ? "bg-emerald-400" : "bg-slate-500"}`}
                  style={{ width: `${Math.max(4, (r.total_score / max) * 100)}%` }}
                />
              </span>
            </span>
            <span className="text-right">
              <span className="block text-lg font-semibold tabular-nums text-slate-100">{r.total_score.toFixed(1)}</span>
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">C+1</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RouteSummary({
  orientation,
  route,
  routes,
  onSelectRoute,
}: {
  orientation: OrientationResult;
  route: Route;
  routes: Route[];
  onSelectRoute: (index: number) => void;
}) {
  const p = route.first_pair;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="十字手感分" value={route.cross_ergonomic_score.toFixed(1)} />
        <Stat label="首组 C+1 分" value={route.c1_score.toFixed(1)} />
        <Stat label="综合分" value={route.total_score.toFixed(1)} accent />
      </div>
      <ol className="space-y-1.5 text-sm text-slate-300">
        <li>
          <span className="text-slate-500">1 观察：</span>
          <Alg>{orientation.inspection_alg}</Alg> <span className="text-xs text-slate-500">（白底，{orientation.label}）</span>
        </li>
        <li>
          <span className="text-slate-500">2 十字：</span>
          <Alg>{route.cross}</Alg> <span className="text-xs text-slate-500">{route.cross_moves} 步</span>
        </li>
        <li>
          <span className="text-slate-500">3 首组：</span>
          {p.rul_alg ? (
            <>
              <Alg>{p.rul_alg}</Alg>{" "}
              <span className="text-xs text-slate-500">
                {p.slot_label} · {p.rul_moves} 步 · 无转体
              </span>
            </>
          ) : (
            <span className="text-rose-300">四槽均为 Bad EO</span>
          )}
        </li>
      </ol>
      {routes.length > 1 && (
        <div>
          <div className="mb-1.5 text-xs text-slate-500">同朝向的其他最优十字（{routes.length} 条）</div>
          <div className="flex flex-wrap gap-1.5">
            {routes.map((r, i) => (
              <button
                key={r.cross}
                type="button"
                onClick={() => onSelectRoute(i)}
                className={`rounded-lg px-2 py-1 font-mono text-xs transition ${
                  r === route ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40" : "bg-black/30 text-slate-400 hover:text-slate-200"
                }`}
                title={`综合分 ${r.total_score}`}
              >
                {r.cross} <span className="text-slate-500">· {r.total_score.toFixed(0)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${accent ? "bg-emerald-400/10 ring-1 ring-emerald-400/30" : "bg-black/25"}`}>
      <div className={`text-lg font-semibold tabular-nums ${accent ? "text-emerald-300" : "text-slate-100"}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

const CATEGORY: Record<PairCard["category"], { label: string; tone: "emerald" | "sky" | "amber" | "rose" }> = {
  excellent: { label: "极品标态", tone: "emerald" },
  comfortable: { label: "顺手好块", tone: "sky" },
  stuck: { label: "粘连/拆解", tone: "amber" },
  bad_eo: { label: "Bad EO", tone: "rose" },
};

export function PairCards({
  pairs,
  activeSlot,
  onPlay,
}: {
  pairs: PairCard[];
  activeSlot: string | null;
  onPlay: (pair: PairCard) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {pairs.map((p, i) => {
        const cat = CATEGORY[p.category];
        const fiveMove = p.rul_moves === 5;
        return (
          <button
            key={p.slot}
            type="button"
            disabled={!p.rul_alg}
            onClick={() => onPlay(p)}
            className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
              p.back_slot_priority
                ? "border-violet-400/40 bg-violet-500/[0.08] hover:border-violet-300/70"
                : p.comfortable
                  ? "border-sky-400/25 bg-sky-500/[0.05] hover:border-sky-300/60"
                  : "border-white/5 bg-black/20 opacity-80"
            } ${activeSlot === p.slot ? "ring-2 ring-emerald-400/60" : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-100">{p.slot}</span>
                <span className="text-xs text-slate-400">{p.slot_label.split(" ")[1]}</span>
                {i === 0 && <Badge tone="emerald">首选</Badge>}
              </span>
              <span className="text-right">
                <span className="text-xl font-semibold tabular-nums text-slate-100">{p.rul_moves ?? "—"}</span>
                <span className="ml-0.5 text-xs text-slate-500">步</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge tone={cat.tone}>{cat.label}</Badge>
              {fiveMove && p.comfortable && <Badge tone="emerald">5 步顺手</Badge>}
              {p.back_slot_priority && <Badge tone="violet">后槽优先</Badge>}
              {p.rotation_free_trigger && <Badge tone="sky">无转体 trigger</Badge>}
              {p.both_in_u && <Badge tone="slate">双块在 U 层</Badge>}
            </div>
            <div className="min-h-[1.75rem] text-sm">
              {p.rul_alg ? (
                <Alg>{p.rul_alg}</Alg>
              ) : (
                <span className="text-xs text-rose-300/80">需转体 y 或 Sledge 变向</span>
              )}
              {p.trigger && <span className="ml-2 text-[11px] text-slate-500">收尾 {p.trigger}</span>}
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                角 {p.corner_location} · 棱 {p.edge_location}
              </span>
              <span className="tabular-nums">评分 {p.c1_score.toFixed(1)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function InsertionCards({
  highlights,
  selectedRotation,
  onPlay,
}: {
  highlights: InsertionHighlight[];
  selectedRotation: string;
  onPlay: (h: InsertionHighlight) => void;
}) {
  if (!highlights.length) {
    return <p className="text-sm text-slate-500">本把打乱的四个朝向里，没有检测到「十字最后一步前插 U/U&apos; 把 7+ 步粘连块变成 ≤5 步直插」的机会。</p>;
  }
  const sorted = [...highlights].sort(
    (a, b) => Number(b.rotation === selectedRotation) - Number(a.rotation === selectedRotation),
  );
  return (
    <div className="space-y-2">
      {sorted.slice(0, 4).map((h) => (
        <div
          key={`${h.rotation}|${h.new_cross}|${h.slot}`}
          className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3"
        >
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium text-amber-200">{h.orientation_label}</span>
            <Badge tone="amber">
              {h.final_move} 前插 {h.auf}
            </Badge>
            {h.is_back_slot && <Badge tone="violet">导向后槽 {h.slot}</Badge>}
            {!h.is_back_slot && <Badge tone="sky">{h.slot}</Badge>}
            {h.improves_first_pair && <Badge tone="emerald">优于原最佳首组</Badge>}
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
            <div className="rounded-lg bg-black/25 p-2">
              <div className="text-[11px] text-slate-500">原十字 · {h.slot} {h.before_moves} 步粘连</div>
              <div className="mt-1 font-mono text-xs text-slate-300">{h.original_cross}</div>
              <div className="font-mono text-xs text-slate-500 line-through decoration-rose-400/60">{h.before_alg}</div>
            </div>
            <span className="text-amber-300">→</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 ring-1 ring-emerald-400/20">
              <div className="text-[11px] text-emerald-300/80">插入后 · {h.after_moves} 步直插</div>
              <div className="mt-1 font-mono text-xs text-slate-200">
                {h.original_cross.split(" ").slice(0, -1).join(" ")} <span className="font-bold text-amber-300">{h.auf}</span>{" "}
                {h.final_move}
              </div>
              <div className="font-mono text-xs text-emerald-200">{h.after_alg}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onPlay(h)}
            className="mt-2 text-xs font-medium text-amber-200 hover:text-amber-100"
          >
            ▶ 在 3D 魔方上演示这条优化
          </button>
        </div>
      ))}
    </div>
  );
}
