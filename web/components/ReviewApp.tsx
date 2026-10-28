"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import CsTimerPage from "@/components/CsTimerPage";
import CubePlayer from "@/components/CubePlayer";
import {
  CoachCard,
  InsertionCards,
  MainColorBar,
  OrientationRanking,
  PairCards,
  RouteSummary,
  Section,
  SolutionDetailModal,
} from "@/components/tutor";
import { analyze, fetchCoach, fetchRandomScramble } from "@/lib/api";
import { highlightPlayback, playbackAlg, routePlayback } from "@/lib/playback";
import type {
  AnalyzeResponse,
  CoachComment,
  CrossColorName,
  PairCard,
  PlaybackSelection,
} from "@/lib/types";

const MAIN_COLOR_STORAGE_KEY = "cubemaster_main_color_v1";

const SAMPLES = [
  { label: "示例打乱 1", scramble: "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2" },
  { label: "加 U 优化案例", scramble: "F2 U2 D R D' B F' U' F D2 F2 U' R B' R' L' F' U' R L F" },
  { label: "加 U' 优化案例", scramble: "F' L R2 U' R' U2 B' F2 U L' R' B' U D B' F2 R B2 F2 U' D" },
];

const TONE_STYLES: Record<PlaybackSelection["segments"][number]["tone"], string> = {
  rotation: "bg-slate-500/25 text-slate-200",
  cross: "bg-sky-500/20 text-sky-200",
  auf: "bg-amber-500/25 text-amber-200",
  pair: "bg-emerald-500/20 text-emerald-200",
};

interface Props {
  initialPage?: "analyze" | "timer";
}

export default function ReviewApp({ initialPage = "analyze" }: Props) {
  const [activePage, setActivePage] = useState<"analyze" | "timer">(initialPage);

  // User preference: Main Cross Color (主力底色) & whether to compare all 6 colors
  const [mainColor, setMainColor] = useState<CrossColorName>("white");
  const [compareAllColors, setCompareAllColors] = useState<boolean>(true);
  const [selectedColor, setSelectedColor] = useState<CrossColorName>("white");

  const [input, setInput] = useState(SAMPLES[0].scramble);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachComment | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  const [rotation, setRotation] = useState("");
  const [routeIndex, setRouteIndex] = useState(0);
  const [playback, setPlayback] = useState<PlaybackSelection | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [detailPair, setDetailPair] = useState<PairCard | null>(null);
  const [pending, startTransition] = useTransition();

  // Load saved main color preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(MAIN_COLOR_STORAGE_KEY) as CrossColorName | null;
      if (saved && ["white", "yellow", "green", "blue", "red", "orange"].includes(saved)) {
        setMainColor(saved);
        setSelectedColor(saved);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const run = useCallback(
    (scramble: string, preferredMain: CrossColorName = mainColor, compareAll: boolean = compareAllColors) => {
      startTransition(async () => {
        setError(null);
        try {
          const colorsToQuery: CrossColorName[] | undefined = compareAll
            ? undefined
            : [preferredMain];
          const mode = compareAll ? "full" : "custom";
          const res = await analyze(scramble, mode, colorsToQuery);
          setData(res);
          setInput(res.scramble);
          setCoach(res.coach);

          // Default to showing the user's Main Cross Color first!
          const mainSummary =
            res.color_summaries.find((s) => s.cross_color === preferredMain) ??
            res.color_summaries[0];
          const targetColor = mainSummary ? mainSummary.cross_color : res.cross_color;
          const bestO = mainSummary ? mainSummary.best_orientation : res.best_orientation;

          setSelectedColor(targetColor);
          setRotation(bestO.rotation);
          setRouteIndex(0);
          setActiveSlot(bestO.best_route.first_pair.rul_alg ? bestO.best_route.first_pair.slot : null);
          setPlayback(routePlayback(res.scramble, bestO, bestO.best_route));

          setCoachLoading(true);
          fetchCoach(res.scramble, mode, colorsToQuery)
            .then((c) => setCoach(c))
            .catch(() => undefined)
            .finally(() => setCoachLoading(false));
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    },
    [compareAllColors, mainColor],
  );

  useEffect(() => {
    run(SAMPLES[0].scramble, mainColor, compareAllColors);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeColorSummary = useMemo(() => {
    if (!data || !data.color_summaries.length) return null;
    return (
      data.color_summaries.find((s) => s.cross_color === selectedColor) ?? data.color_summaries[0]
    );
  }, [data, selectedColor]);

  const currentOrientations = useMemo(() => {
    if (activeColorSummary) return activeColorSummary.orientations;
    return data?.orientations ?? [];
  }, [activeColorSummary, data]);

  const orientation = useMemo(
    () =>
      currentOrientations.find((o) => o.rotation === rotation) ??
      activeColorSummary?.best_orientation ??
      data?.best_orientation ??
      null,
    [currentOrientations, rotation, activeColorSummary, data],
  );

  const route = orientation ? orientation.routes[routeIndex] ?? orientation.best_route : null;

  const handleChangeMainColor = (newMain: CrossColorName) => {
    setMainColor(newMain);
    try {
      localStorage.setItem(MAIN_COLOR_STORAGE_KEY, newMain);
    } catch {
      // Ignore storage error
    }
    if (data) {
      const existing = data.color_summaries.find((s) => s.cross_color === newMain);
      if (existing) {
        setSelectedColor(newMain);
        const bestO = existing.best_orientation;
        setRotation(bestO.rotation);
        setRouteIndex(0);
        setActiveSlot(bestO.best_route.first_pair.rul_alg ? bestO.best_route.first_pair.slot : null);
        setPlayback(routePlayback(data.scramble, bestO, bestO.best_route));
        return;
      }
    }
    run(input, newMain, compareAllColors);
  };

  const handleToggleCompareAll = (nextVal: boolean) => {
    setCompareAllColors(nextVal);
    run(input, mainColor, nextVal);
  };

  const selectCrossColor = (color: CrossColorName) => {
    if (!data) return;
    const summary = data.color_summaries.find((s) => s.cross_color === color);
    if (!summary) return;
    setSelectedColor(color);
    const bestO = summary.best_orientation;
    setRotation(bestO.rotation);
    setRouteIndex(0);
    setActiveSlot(bestO.best_route.first_pair.rul_alg ? bestO.best_route.first_pair.slot : null);
    setPlayback(routePlayback(data.scramble, bestO, bestO.best_route));
  };

  const selectOrientation = (rot: string) => {
    if (!data) return;
    const o = currentOrientations.find((x) => x.rotation === rot);
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
    run(s, mainColor, compareAllColors);
  };

  const currentColorHighlights = useMemo(() => {
    if (!data) return [];
    return data.insertion_highlights.filter((h) => h.cross_color === selectedColor);
  }, [data, selectedColor]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Top Global Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight text-white">
              CubeMaster <span className="text-emerald-400">C+1</span>
            </span>
            <span className="hidden text-xs text-slate-400 sm:inline">
              十字 + 第一组 F2L 解法拆解与计时器
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-slate-900 p-1">
            <button
              type="button"
              onClick={() => setActivePage("analyze")}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                activePage === "analyze"
                  ? "bg-emerald-400 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              🧩 C+1 解法分析
            </button>
            <button
              type="button"
              onClick={() => setActivePage("timer")}
              className={`rounded-lg px-4 py-1.5 text-sm font-bold transition ${
                activePage === "timer"
                  ? "bg-emerald-400 text-slate-950 shadow-sm"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              ⏱️ 速拧计时器 (csTimer)
            </button>
          </div>
        </div>
      </header>

      {/* Page 2: Dedicated csTimer Full-Screen View */}
      {activePage === "timer" ? (
        <CsTimerPage
          initialScramble={input}
          onJumpToAnalyze={(s) => {
            setInput(s);
            setActivePage("analyze");
            run(s, mainColor, compareAllColors);
          }}
        />
      ) : (
        /* Page 1: Clean, Readable C+1 Solution View */
        <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-6">
          {/* 顶部主力底色设置 + 六色底切换栏 */}
          <MainColorBar
            mainColor={mainColor}
            onChangeMainColor={handleChangeMainColor}
            compareAllColors={compareAllColors}
            onToggleCompareAll={handleToggleCompareAll}
            summaries={data?.color_summaries ?? []}
            selectedColor={selectedColor}
            onSelectColor={selectCrossColor}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(380px,5fr)_7fr]">
            {/* Left Column: Scramble Input + 3D Cube Player */}
            <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(input, mainColor, compareAllColors);
                }}
                className="rounded-2xl border border-white/10 bg-slate-900/60 p-4"
              >
                <div className="flex items-center justify-between">
                  <label htmlFor="scramble" className="text-sm font-bold text-slate-200">
                    当前打乱公式（白顶绿前）
                  </label>
                  <button
                    type="button"
                    onClick={handleRandomScramble}
                    disabled={pending}
                    className="rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30"
                  >
                    🎲 随机换一把打乱
                  </button>
                </div>
                <textarea
                  id="scramble"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={2}
                  spellCheck={false}
                  className="mt-2.5 w-full resize-none rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 font-mono text-base text-white outline-none focus:border-emerald-400"
                  placeholder="输入打乱，如 R U R' U' ..."
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={pending}
                    className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-emerald-200 disabled:opacity-50"
                  >
                    {pending ? "正在计算解法…" : "分析 C+1 解法"}
                  </button>
                  {SAMPLES.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => {
                        setInput(s.scramble);
                        run(s.scramble, mainColor, compareAllColors);
                      }}
                      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {error && (
                  <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                    {error}
                  </p>
                )}
              </form>

              {/* 3D 魔方播放器 */}
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-white">
                    {playback?.title ?? "3D 魔方逐步演示"}
                  </span>
                  <span className="text-xs text-slate-400">可拖动旋转 · 底部进度条可单步播放</span>
                </div>
                <div className="h-[340px] w-full">
                  <CubePlayer
                    setupAlg={playback?.setupAlg ?? ""}
                    alg={playback ? playbackAlg(playback) : ""}
                  />
                </div>
                {playback && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {playback.segments.map((s, i) => (
                      <span
                        key={i}
                        className={`rounded-lg px-2.5 py-1 text-xs font-medium ${TONE_STYLES[s.tone]}`}
                      >
                        <span className="opacity-80">{s.label}：</span>{" "}
                        <span className="font-mono font-bold">{s.alg}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Clear Step-by-Step Solution Breakdown */}
            <div className="space-y-5">
              {data && orientation && route ? (
                <>
                  {coach && <CoachCard coach={coach} loading={coachLoading} />}

                  <Section
                    title={`① 推荐 C+1 完整解法（${orientation.cross_color_label} · ${orientation.label}）`}
                    subtitle="直接按顺序跟做，或点击按钮看每一步的详细拆解"
                  >
                    <RouteSummary
                      orientation={orientation}
                      route={route}
                      routes={orientation.routes}
                      onSelectRoute={selectRoute}
                      onOpenDetail={(pair) => setDetailPair(pair)}
                    />
                  </Section>

                  <Section
                    title={`② 当前十字后的 4 个 F2L 槽位解法对比`}
                    subtitle="点击「查看详细说明」可看该槽位角块、棱块位置及入槽原理"
                  >
                    <PairCards
                      pairs={route.pairs}
                      activeSlot={activeSlot}
                      onPlay={playPair}
                      onOpenDetail={(pair) => setDetailPair(pair)}
                    />
                  </Section>

                  <Section
                    title={`③ ${orientation.cross_color_label}四个起手方向切换`}
                    subtitle="点击不同朝向可对比哪一面朝自己最顺手"
                  >
                    <OrientationRanking
                      orientations={currentOrientations}
                      selected={rotation}
                      onSelect={selectOrientation}
                    />
                  </Section>

                  <Section
                    title="④ 进阶微调：十字最后一步前加 U / U' 优化"
                    subtitle="当第一组块卡在一起时，做十字顺手拨一下顶层即可变直插"
                  >
                    <InsertionCards
                      highlights={currentColorHighlights}
                      selectedRotation={rotation}
                      onPlay={(h) => {
                        setActiveSlot(null);
                        setPlayback(highlightPlayback(data.scramble, h));
                      }}
                    />
                  </Section>
                </>
              ) : (
                <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-white/10 text-base text-slate-400">
                  {pending
                    ? "正在计算底十字与第一组 F2L 解法…"
                    : error
                      ? "请检查打乱公式后重试"
                      : "输入打乱开始分析"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Detailed Solution Explanation Modal */}
      {detailPair && orientation && route && (
        <SolutionDetailModal
          orientation={orientation}
          route={route}
          pair={detailPair}
          onClose={() => setDetailPair(null)}
          onPlayIn3D={(pair) => playPair(pair)}
        />
      )}
    </div>
  );
}
