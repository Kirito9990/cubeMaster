"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import CubePlayer from "@/components/CubePlayer";
import TimerTrainer from "@/components/TimerTrainer";
import {
  CoachCard,
  ColorNeutralitySelector,
  ColorRankingCards,
  InsertionCards,
  OrientationRanking,
  PairCards,
  RouteSummary,
  Section,
} from "@/components/tutor";
import { analyze, fetchCoach, fetchRandomScramble } from "@/lib/api";
import { highlightPlayback, playbackAlg, routePlayback } from "@/lib/playback";
import type {
  AnalyzeResponse,
  CoachComment,
  ColorMode,
  CrossColorName,
  PairCard,
  PlaybackSelection,
} from "@/lib/types";

const SAMPLES = [
  { label: "引擎示例 (蓝/绿底占优)", scramble: "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2" },
  { label: "U 插入案例", scramble: "F2 U2 D R D' B F' U' F D2 F2 U' R B' R' L' F' U' R L F" },
  { label: "U' 插入案例", scramble: "F' L R2 U' R' U2 B' F2 U L' R' B' U D B' F2 R B2 F2 U' D" },
];

const TONE_STYLES: Record<PlaybackSelection["segments"][number]["tone"], string> = {
  rotation: "bg-slate-500/20 text-slate-200",
  cross: "bg-sky-500/15 text-sky-200",
  auf: "bg-amber-500/20 text-amber-200",
  pair: "bg-emerald-500/15 text-emerald-200",
};

export default function ReviewApp() {
  const [activeTab, setActiveTab] = useState<"review" | "trainer">("review");
  const [input, setInput] = useState(SAMPLES[0].scramble);
  const [colorMode, setColorMode] = useState<ColorMode>("dual");
  const [customColors, setCustomColors] = useState<CrossColorName[]>(["white", "yellow", "green", "blue"]);
  const [activeColor, setActiveColor] = useState<CrossColorName>("white");

  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachComment | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [rotation, setRotation] = useState("");
  const [routeIndex, setRouteIndex] = useState(0);
  const [playback, setPlayback] = useState<PlaybackSelection | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [cubeMasked, setCubeMasked] = useState(false);
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    (scramble: string, mode: ColorMode = colorMode, custom: CrossColorName[] = customColors) => {
      startTransition(async () => {
        setError(null);
        const colorsParam = mode === "custom" ? custom : undefined;
        try {
          const res = await analyze(scramble, mode, colorsParam);
          const best = res.best_orientation;
          setData(res);
          setInput(res.scramble);
          setCoach(res.coach);
          setActiveColor(res.cross_color);
          setRotation(best.rotation);
          setRouteIndex(0);
          setActiveSlot(best.best_route.first_pair.rul_alg ? best.best_route.first_pair.slot : null);
          setPlayback(routePlayback(res.scramble, best, best.best_route));
          setCoachLoading(true);
          fetchCoach(res.scramble, mode, colorsParam)
            .then((c) => setCoach(c))
            .catch(() => undefined)
            .finally(() => setCoachLoading(false));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [colorMode, customColors],
  );

  useEffect(() => {
    run(SAMPLES[0].scramble, "dual", customColors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentColorSummary = useMemo(() => {
    if (!data) return null;
    return (
      data.color_summaries.find((s) => s.cross_color === activeColor) ??
      data.color_summaries[0] ??
      null
    );
  }, [data, activeColor]);

  const orientations = useMemo(
    () => currentColorSummary?.orientations ?? data?.orientations ?? [],
    [currentColorSummary, data],
  );

  const orientation = useMemo(
    () =>
      orientations.find((o) => o.rotation === rotation) ??
      currentColorSummary?.best_orientation ??
      data?.best_orientation ??
      null,
    [orientations, rotation, currentColorSummary, data],
  );

  const route = orientation ? orientation.routes[routeIndex] ?? orientation.best_route : null;

  const handleChangeMode = (mode: ColorMode) => {
    setColorMode(mode);
    run(input, mode, customColors);
  };

  const handleToggleCustomColor = (col: CrossColorName) => {
    const exists = customColors.includes(col);
    const next = exists
      ? customColors.length > 1
        ? customColors.filter((c) => c !== col)
        : customColors
      : [...customColors, col];
    setCustomColors(next);
    run(input, "custom", next);
  };

  const selectColor = (col: CrossColorName) => {
    if (!data) return;
    const summary = data.color_summaries.find((s) => s.cross_color === col);
    if (!summary) return;
    setActiveColor(col);
    const bestO = summary.best_orientation;
    setRotation(bestO.rotation);
    setRouteIndex(0);
    setActiveSlot(bestO.best_route.first_pair.rul_alg ? bestO.best_route.first_pair.slot : null);
    setPlayback(routePlayback(data.scramble, bestO, bestO.best_route));
  };

  const selectOrientation = (rot: string) => {
    if (!data) return;
    const o = orientations.find((x) => x.rotation === rot);
    if (!o) return;
    setRotation(rot);
    setRouteIndex(0);
    setActiveSlot(o.best_route.first_pair.rul_alg ? o.best_route.first_pair.slot : null);
    setPlayback(routePlayback(data.scramble, o, o.best_route));
  };

  const selectRoute = (i: number) => {
    if (!data || !orientation) return;
    const r = orientation.routes[i];
    setRouteIndex(i);
    setActiveSlot(r.first_pair.rul_alg ? r.first_pair.slot : null);
    setPlayback(routePlayback(data.scramble, orientation, r));
  };

  const playPair = (pair: PairCard) => {
    if (!data || !orientation || !route) return;
    setActiveSlot(pair.slot);
    setPlayback(routePlayback(data.scramble, orientation, route, pair));
  };

  const handleRandomScramble = async () => {
    const s = await fetchRandomScramble(20);
    setInput(s);
    run(s, colorMode, customColors);
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 antialiased">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 ring-1 ring-sky-500/30">
              <span className="font-mono font-bold text-lg">C+1</span>
            </div>
            <div>
              <h1 className="font-semibold text-base text-slate-100">CubeMaster · 色向中立 & 计时训练系统</h1>
              <p className="text-xs text-slate-400">Sub-10 全色向十字 + 首组 F2L 智能规划与盲打特训</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-800 bg-slate-950 p-1">
              <button
                onClick={() => {
                  setActiveTab("review");
                  setCubeMasked(false);
                }}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeTab === "review"
                    ? "bg-sky-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🔍 C+1 复盘 & 色向对比
              </button>
              <button
                onClick={() => setActiveTab("trainer")}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeTab === "trainer"
                    ? "bg-emerald-600 text-white shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                ⏱️ 速拧计时 & 15s 观察盲打
              </button>
            </div>

            {data && (
              <div className="hidden md:flex items-center gap-2 text-xs text-slate-400 pl-2">
                <span>
                  引擎耗时 <strong className="text-slate-200">{data.elapsed_ms}ms</strong>
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 space-y-6">
        {/* 顶部打乱输入与色向中立模式切换 */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg backdrop-blur-sm space-y-4">
          <div>
            <label htmlFor="scramble" className="block text-xs font-medium text-slate-400 mb-1.5">
              WCA 3x3 打乱公式 (白顶绿前标准打乱 · 支持手动输入或一键随机生成)
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="scramble"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="如: D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-sm text-slate-100 placeholder-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => run(input)}
                  disabled={pending}
                  className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50 transition"
                >
                  {pending ? "计算中..." : "分析 C+1"}
                </button>
                <button
                  onClick={handleRandomScramble}
                  disabled={pending}
                  className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  🎲 随机打乱
                </button>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2 text-xs">
              <span className="text-slate-500 self-center">经典教材打乱:</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInput(s.scramble);
                    run(s.scramble);
                  }}
                  className="rounded-md border border-slate-700/80 bg-slate-800/60 px-2.5 py-1 text-slate-300 hover:border-slate-600 hover:bg-slate-800 transition"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <ColorNeutralitySelector
            colorMode={colorMode}
            customColors={customColors}
            onChangeMode={handleChangeMode}
            onToggleCustomColor={handleToggleCustomColor}
          />
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            {error}
          </div>
        )}

        {data && orientation && route && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* 左侧常驻 3D 魔方可视化播放器 */}
            <div className="lg:col-span-5 space-y-6">
              <div className="sticky top-20 rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-300">
                    {playback?.title ?? "3D 演示"}
                  </h2>
                  {cubeMasked && (
                    <button
                      onClick={() => setCubeMasked(false)}
                      className="text-xs text-amber-300 underline"
                    >
                      提前揭开遮罩
                    </button>
                  )}
                </div>
                <div className="aspect-square w-full rounded-lg bg-slate-950 overflow-hidden border border-slate-800">
                  {playback && (
                    <CubePlayer
                      setupAlg={playback.setupAlg}
                      alg={playbackAlg(playback)}
                      masked={cubeMasked}
                    />
                  )}
                </div>
                {playback && !cubeMasked && (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium text-slate-400">分步拆解轨迹：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {playback.segments.map((seg, i) => (
                        <span
                          key={i}
                          className={`rounded px-2 py-1 text-xs font-mono font-medium ${TONE_STYLES[seg.tone]}`}
                        >
                          {seg.label}: {seg.alg}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 右侧工作区：根据 activeTab 切换「复盘分析」与「计时训练」 */}
            <div className="lg:col-span-7 space-y-6">
              {activeTab === "trainer" ? (
                <TimerTrainer
                  scramble={data.scramble}
                  analysis={data}
                  onNewScramble={handleRandomScramble}
                  onLoadScramble={(s) => {
                    setInput(s);
                    run(s);
                  }}
                  onMaskChange={setCubeMasked}
                  onPlayOptimal={() => {
                    const bestO = data.global_best_orientation ?? data.best_orientation;
                    setActiveColor(bestO.cross_color);
                    setRotation(bestO.rotation);
                    setRouteIndex(0);
                    setPlayback(routePlayback(data.scramble, bestO, bestO.best_route));
                  }}
                />
              ) : (
                <>
                  <CoachCard coach={coach} loading={coachLoading} />

                  {data.color_summaries.length > 1 && (
                    <Section title={`0. 多底色 C+1 総合评分排行 (共对比 ${data.color_summaries.length} 种底色)`}>
                      <ColorRankingCards
                        summaries={data.color_summaries}
                        activeColor={activeColor}
                        onSelectColor={selectColor}
                      />
                    </Section>
                  )}

                  <Section title={`1. 观察朝向评估 (${currentColorSummary?.cross_color_label ?? "白底"} · Top 4 朝向)`}>
                    <OrientationRanking
                      orientations={orientations}
                      activeRotation={rotation}
                      onSelect={selectOrientation}
                    />
                  </Section>

                  <Section title="2. 十字解法分支">
                    <RouteSummary
                      routes={orientation.routes}
                      activeIndex={routeIndex}
                      onSelect={selectRoute}
                    />
                  </Section>

                  <Section title="3. 槽位 F2L 顺手度分析 (无转体直插)">
                    <PairCards
                      pairs={route.pairs}
                      activeSlot={activeSlot}
                      onPlay={playPair}
                    />
                  </Section>

                  {data.insertion_highlights.length > 0 && (
                    <Section title="4. 十字插入技巧 (UF 优化推荐)">
                      <InsertionCards
                        highlights={data.insertion_highlights}
                        onPlay={(h) => setPlayback(highlightPlayback(data.scramble, h))}
                      />
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
