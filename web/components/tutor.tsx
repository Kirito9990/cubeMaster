"use client";

import {
  explainAlgTokens,
  explainCrossPlain,
  explainHolding,
  explainInsertionPlain,
  explainPairPlain,
  humanLocation,
  humanSlotName,
} from "@/lib/explain";
import type {
  CoachComment,
  ColorCrossSummary,
  CrossColorName,
  InsertionHighlight,
  OrientationResult,
  PairCard,
  Route,
} from "@/lib/types";

export const CROSS_COLORS_META: {
  id: CrossColorName;
  label: string;
  dotClass: string;
}[] = [
  { id: "white", label: "白底", dotClass: "bg-white border border-slate-300" },
  { id: "yellow", label: "黄底", dotClass: "bg-yellow-300" },
  { id: "green", label: "绿底", dotClass: "bg-emerald-500" },
  { id: "blue", label: "蓝底", dotClass: "bg-blue-500" },
  { id: "red", label: "红底", dotClass: "bg-red-500" },
  { id: "orange", label: "橙底", dotClass: "bg-orange-500" },
];

const FRONT_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  white: "bg-white",
  yellow: "bg-yellow-300",
};

export function Alg({ children, className = "" }: { children: string; className?: string }) {
  return (
    <code
      className={`inline-block rounded-lg bg-slate-950/80 px-2.5 py-1 font-mono text-base font-semibold tracking-wide text-sky-200 ring-1 ring-white/10 ${className}`}
    >
      {children || "无需转动 (0 步)"}
    </code>
  );
}

export function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        {subtitle && <div className="text-sm text-slate-400">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * 主力底面设置 + 六色底切换栏
 */
export function MainColorBar({
  mainColor,
  onChangeMainColor,
  compareAllColors,
  onToggleCompareAll,
  summaries,
  selectedColor,
  onSelectColor,
}: {
  mainColor: CrossColorName;
  onChangeMainColor: (c: CrossColorName) => void;
  compareAllColors: boolean;
  onToggleCompareAll: (v: boolean) => void;
  summaries: ColorCrossSummary[];
  selectedColor: CrossColorName;
  onSelectColor: (c: CrossColorName) => void;
}) {
  const bestSummary = summaries[0];
  const mainSummary = summaries.find((s) => s.cross_color === mainColor);
  const hasBetterOtherColor =
    compareAllColors &&
    bestSummary &&
    mainSummary &&
    bestSummary.cross_color !== mainColor &&
    bestSummary.best_total_score - mainSummary.best_total_score >= 4;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">我的主力底面：</span>
          <div className="flex flex-wrap gap-1.5">
            {CROSS_COLORS_META.map((c) => {
              const isMain = mainColor === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChangeMainColor(c.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                    isMain
                      ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/60 font-bold"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.dotClass}`} />
                  {c.label}
                  {isMain && <span className="text-[11px] text-emerald-300">（主力）</span>}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 select-none">
          <input
            type="checkbox"
            checked={compareAllColors}
            onChange={(e) => onToggleCompareAll(e.target.checked)}
            className="h-4 w-4 rounded accent-emerald-400"
          />
          同时对比其余 5 色底（六色底参考）
        </label>
      </div>

      {compareAllColors && summaries.length > 1 && (
        <div className="pt-2 border-t border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>点击下方任意底色即可切换查看对应的十字与第一组解法：</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
            {CROSS_COLORS_META.map((meta) => {
              const s = summaries.find((x) => x.cross_color === meta.id);
              if (!s) return null;
              const isSelected = selectedColor === meta.id;
              const isMain = mainColor === meta.id;
              const isBest = s.rank === 1;
              return (
                <button
                  key={meta.id}
                  type="button"
                  onClick={() => onSelectColor(meta.id)}
                  className={`flex flex-col justify-between rounded-xl border p-2.5 text-left transition ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/50"
                      : "border-white/10 bg-black/30 hover:border-white/25"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-white">
                      <span className={`h-3 w-3 rounded-full ${meta.dotClass}`} />
                      {meta.label}
                    </span>
                    {isMain ? (
                      <span className="text-[11px] font-semibold text-emerald-300">主力</span>
                    ) : isBest ? (
                      <span className="text-[11px] font-semibold text-amber-300">本把最顺</span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-xs text-slate-300">
                    十字 {s.optimal_cross_moves} 步 · 首组{" "}
                    {s.best_slot_moves !== null ? `${s.best_slot_moves} 步` : "需转体"}
                  </div>
                </button>
              );
            })}
          </div>

          {hasBetterOtherColor && bestSummary && mainSummary && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200 ring-1 ring-amber-400/30">
              <span>
                💡 提示：这把打乱下，<strong>{bestSummary.cross_color_label}</strong>（十字{" "}
                {bestSummary.optimal_cross_moves} 步 + 第一组 {bestSummary.best_slot_moves ?? "—"} 步）比你的主力
                {mainSummary.cross_color_label}更简单顺手。
              </span>
              {selectedColor !== bestSummary.cross_color && (
                <button
                  type="button"
                  onClick={() => onSelectColor(bestSummary.cross_color)}
                  className="rounded-lg bg-amber-400/20 px-2.5 py-1 font-semibold text-amber-100 hover:bg-amber-400/30"
                >
                  切换看{bestSummary.cross_color_label}解法 →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CoachCard({ coach, loading }: { coach: CoachComment; loading: boolean }) {
  return (
    <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-bold text-emerald-300">💡 一句话核心要点</span>
        {loading && <span className="text-xs text-emerald-200/70">正在生成要点…</span>}
      </div>
      <p className="text-base leading-relaxed text-slate-100">{coach.text}</p>
    </div>
  );
}

/**
 * 2. 核心解法大卡片（三步清晰展示 + 点击打开详细解法说明）
 */
export function RouteSummary({
  orientation,
  route,
  routes,
  onSelectRoute,
  onOpenDetail,
}: {
  orientation: OrientationResult;
  route: Route;
  routes: Route[];
  onSelectRoute: (index: number) => void;
  onOpenDetail: (pair: PairCard) => void;
}) {
  const p = route.first_pair;
  const holding = explainHolding(orientation);
  const crossInfo = explainCrossPlain(route);
  const pairInfo = explainPairPlain(p);

  return (
    <div className="space-y-4">
      {/* 三步大字清晰拆解 */}
      <div className="grid gap-3">
        {/* Step 1: 怎么拿魔方 */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-slate-300">第 1 步 · 起手怎么拿魔方</span>
            <Alg className="text-sm">{orientation.inspection_alg || "白顶绿前直拿"}</Alg>
          </div>
          <p className="mt-2 text-base font-semibold text-white">{holding.headline}</p>
          <p className="mt-1 text-sm text-slate-400">{holding.subline}</p>
        </div>

        {/* Step 2: 底十字 */}
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-sky-300">
              第 2 步 · 还原底十字（{route.cross_moves} 步）
            </span>
          </div>
          <div className="mt-2.5">
            <Alg className="text-lg md:text-xl text-sky-200">{route.cross}</Alg>
          </div>
          <p className="mt-2 text-sm text-slate-300">{crossInfo.shortText}</p>
        </div>

        {/* Step 3: 第一组 F2L */}
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-emerald-300">
              第 3 步 · 紧接着做第一组 F2L（{humanSlotName(p.slot)}
              {p.rul_moves !== null ? ` · ${p.rul_moves} 步` : ""}）
            </span>
          </div>
          <div className="mt-2.5">
            {p.rul_alg ? (
              <Alg className="text-lg md:text-xl text-emerald-200">{p.rul_alg}</Alg>
            ) : (
              <span className="text-base font-medium text-rose-300">
                当前四个槽位都需要转体 y，建议切换上方其他起手方向
              </span>
            )}
          </div>
          <p className="mt-2 text-sm text-slate-200">{pairInfo.oneLiner}</p>
          <p className="mt-1 text-xs text-slate-400">{pairInfo.startPositionText}</p>
        </div>
      </div>

      {/* 查看详细说明大按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => onOpenDetail(p)}
          className="flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-emerald-300"
        >
          📖 查看这套解法详细说明（每一步拆解）
        </button>

        {routes.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400">同方向备选十字：</span>
            {routes.slice(0, 4).map((r, i) => (
              <button
                key={r.cross}
                type="button"
                onClick={() => onSelectRoute(i)}
                className={`rounded-lg px-2.5 py-1 font-mono text-xs transition ${
                  r === route
                    ? "bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50 font-semibold"
                    : "bg-black/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                {r.cross}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 四个起手方向切换（简洁明了，无杂乱进度条和标签）
 */
export function OrientationRanking({
  orientations,
  selected,
  onSelect,
}: {
  orientations: OrientationResult[];
  selected: string;
  onSelect: (rotation: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {orientations.map((o) => {
        const r = o.best_route;
        const p = r.first_pair;
        const active = o.rotation === selected;
        return (
          <button
            key={o.rotation || "none"}
            type="button"
            onClick={() => onSelect(o.rotation)}
            className={`flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${
              active
                ? "border-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-400/40"
                : "border-white/10 bg-black/25 hover:border-white/25"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-base font-bold text-white">
                <span className={`h-3 w-3 rounded-full ${FRONT_DOT[o.front_color]}`} />
                {o.label}
              </span>
              {o.rank === 1 && (
                <span className="text-xs font-semibold text-emerald-300">最推荐方向</span>
              )}
            </div>
            <div className="mt-2 space-y-1 text-sm text-slate-300">
              <div>
                十字（{o.optimal_cross_moves}步）：
                <span className="font-mono font-semibold text-sky-200">{r.cross || "已完成"}</span>
              </div>
              <div>
                第一组：
                {p.rul_alg ? (
                  <span>
                    {humanSlotName(p.slot)}（{p.rul_moves}步{" "}
                    <span className="font-mono font-semibold text-emerald-200">{p.rul_alg}</span>）
                  </span>
                ) : (
                  <span className="text-rose-300">需转体</span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 四个 F2L 槽位卡片（删去繁杂标签，直接写明槽位、步数、公式、大白话解释 + 详细说明按钮）
 */
export function PairCards({
  pairs,
  activeSlot,
  onPlay,
  onOpenDetail,
}: {
  pairs: PairCard[];
  activeSlot: string | null;
  onPlay: (pair: PairCard) => void;
  onOpenDetail: (pair: PairCard) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {pairs.map((p, i) => {
        const info = explainPairPlain(p);
        const isSelected = activeSlot === p.slot;
        return (
          <div
            key={p.slot}
            className={`flex flex-col justify-between rounded-xl border p-4 transition ${
              isSelected
                ? "border-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-400/50"
                : "border-white/10 bg-black/25"
            }`}
          >
            <div>
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white">{humanSlotName(p.slot)}</span>
                  {i === 0 && p.rul_alg && (
                    <span className="text-xs font-semibold text-emerald-300">★ 推荐首选</span>
                  )}
                </div>
                <span className="text-lg font-bold text-slate-100">
                  {p.rul_moves !== null ? `${p.rul_moves} 步` : "需转体"}
                </span>
              </div>

              <div className="mt-3">
                {p.rul_alg ? (
                  <Alg className="text-base text-emerald-200">{p.rul_alg}</Alg>
                ) : (
                  <span className="inline-block rounded-lg bg-rose-500/10 px-2.5 py-1 text-sm text-rose-300">
                    无法不转魔方直接入槽
                  </span>
                )}
              </div>

              <p className="mt-2.5 text-sm leading-relaxed text-slate-300">{info.oneLiner}</p>
              <p className="mt-1 text-xs text-slate-400">
                做完十字后位置：角块在 {humanLocation(p.corner_location)} · 棱块在 {humanLocation(p.edge_location)}
              </p>
            </div>

            <div className="mt-4 flex items-center gap-2 pt-2 border-t border-white/10">
              {p.rul_alg && (
                <button
                  type="button"
                  onClick={() => onPlay(p)}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                >
                  ▶ 在 3D 魔方演示
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenDetail(p)}
                className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
              >
                📖 查看详细说明
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 十字最后一步前加 U/U' 的顺手优化卡片
 */
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
    return (
      <p className="text-sm text-slate-400">
        这把打乱直接按上方推荐十字做即可，无需在十字收尾额外加 U / U&apos; 微调。
      </p>
    );
  }
  const sorted = [...highlights].sort(
    (a, b) => Number(b.rotation === selectedRotation) - Number(a.rotation === selectedRotation),
  );
  return (
    <div className="space-y-3">
      {sorted.slice(0, 3).map((h) => {
        const exp = explainInsertionPlain(h);
        return (
          <div
            key={`${h.cross_color}|${h.rotation}|${h.new_cross}|${h.slot}`}
            className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-bold text-amber-200">
                ✨ {h.cross_color_label} · {h.orientation_label}：{exp.title}
              </span>
            </div>

            <p className="text-sm leading-relaxed text-slate-200">{exp.body}</p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
              <div className="rounded-lg bg-black/30 p-3">
                <div className="text-xs text-slate-400">原做法（{h.slot} 槽需 {h.before_moves} 步拆解）：</div>
                <div className="mt-1 font-mono text-sm text-slate-300">
                  十字：{h.original_cross} → 第一组：{h.before_alg}
                </div>
              </div>
              <div className="rounded-lg bg-emerald-500/15 p-3 ring-1 ring-emerald-400/30">
                <div className="text-xs text-emerald-300">
                  加一步 {h.auf} 后（{h.slot} 槽仅需 {h.after_moves} 步直插）：
                </div>
                <div className="mt-1 font-mono text-sm text-white">
                  十字：{h.original_cross.split(" ").slice(0, -1).join(" ")}{" "}
                  <span className="font-bold text-amber-300">{h.auf}</span> {h.final_move} → 第一组：
                  <span className="font-bold text-emerald-200">{h.after_alg}</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onPlay(h)}
              className="rounded-lg bg-amber-400/20 px-3.5 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/30"
            >
              ▶ 在 3D 魔方演示这条优化路线
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 弹窗：点击「📖 查看详细说明」后显示的完整步骤拆解面板
 */
export function SolutionDetailModal({
  orientation,
  route,
  pair,
  onClose,
  onPlayIn3D,
}: {
  orientation: OrientationResult;
  route: Route;
  pair: PairCard;
  onClose: () => void;
  onPlayIn3D: (pair: PairCard) => void;
}) {
  const holding = explainHolding(orientation);
  const crossInfo = explainCrossPlain(route);
  const pairInfo = explainPairPlain(pair);
  const crossSteps = explainAlgTokens(route.cross);
  const pairSteps = explainAlgTokens(pair.rul_alg ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 p-6 text-slate-100 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
          <div>
            <h3 className="text-xl font-bold text-white">
              📖 解法详细说明：{orientation.cross_color_label} · {orientation.label} + {humanSlotName(pair.slot)}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              把公式拆成大白话，看懂每一步为什么这么转、角块和棱块是怎么进槽的
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-medium text-slate-300 hover:bg-white/20"
          >
            关闭 ✕
          </button>
        </div>

        {/* 第一部分：怎么拿魔方 */}
        <div className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-1.5">
          <div className="text-sm font-bold text-emerald-300">一、起手拿法（15 秒观察期）</div>
          <p className="text-base font-semibold text-white">
            拿法：{holding.headline}（记号：{orientation.inspection_alg || "无预转体"}）
          </p>
          <p className="text-sm leading-relaxed text-slate-300">
            标准打乱是「白顶绿前」。打乱完成后，{holding.subline}。这样开表后就不用再一边还原一边找中心块了。
          </p>
        </div>

        {/* 第二部分：底十字拆解 */}
        <div className="rounded-xl border border-sky-400/25 bg-sky-500/[0.06] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-sky-300">
              二、底十字（Cross）逐步拆解（共 {route.cross_moves} 步）
            </span>
            <Alg>{route.cross}</Alg>
          </div>
          <p className="text-sm leading-relaxed text-slate-200">{crossInfo.detailText}</p>
          {crossSteps.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {crossSteps.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2.5 rounded-lg bg-black/40 px-3 py-2 text-xs text-slate-200"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 font-mono font-bold text-sky-300">
                    {idx + 1}
                  </span>
                  <span className="font-mono text-sm font-bold text-sky-200 w-7">{s.token}</span>
                  <span>{s.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 第三部分：第一组 F2L 详解 */}
        <div className="rounded-xl border border-emerald-400/30 bg-emerald-500/[0.07] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-emerald-300">
              三、第一组 F2L（{humanSlotName(pair.slot)}）原理拆解
            </span>
            {pair.rul_alg && <Alg className="text-emerald-200">{pair.rul_alg}</Alg>}
          </div>

          <div className="space-y-2 text-sm leading-relaxed text-slate-200">
            <p>
              <strong>1. 块在哪里：</strong>
              {pairInfo.startPositionText}
            </p>
            <p>
              <strong>2. 怎么配对入槽：</strong>
              {pairInfo.pairingLogicText}
            </p>
            <p>
              <strong>3. 连贯性与观察建议：</strong>
              {pairInfo.visionAdviceText}
            </p>
          </div>

          {pairSteps.length > 0 && (
            <div className="pt-1">
              <div className="mb-2 text-xs font-semibold text-slate-400">第一组 F2L 每一步动作对照：</div>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {pairSteps.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2.5 rounded-lg bg-black/40 px-3 py-2 text-xs text-slate-200"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 font-mono font-bold text-emerald-300">
                      {idx + 1}
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-200 w-7">{s.token}</span>
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          {pair.rul_alg && (
            <button
              type="button"
              onClick={() => {
                onPlayIn3D(pair);
                onClose();
              }}
              className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-emerald-300"
            >
              ▶ 在左侧 3D 魔方上播放这套解法
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/10"
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  );
}
