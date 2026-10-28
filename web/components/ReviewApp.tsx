"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import CubePlayer from "@/components/CubePlayer";
import {
  CoachCard,
  InsertionCards,
  OrientationRanking,
  PairCards,
  RouteSummary,
  Section,
} from "@/components/tutor";
import { analyze, fetchCoach } from "@/lib/api";
import { highlightPlayback, playbackAlg, routePlayback } from "@/lib/playback";
import type { AnalyzeResponse, CoachComment, PairCard, PlaybackSelection } from "@/lib/types";

const SAMPLES = [
  { label: "引擎示例", scramble: "D L' F2 R' B2 L' U2 F2 R B2 R2 D2 B2 F' L' R' U' B L B2 R2" },
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
  const [input, setInput] = useState(SAMPLES[0].scramble);
  const [data, setData] = useState<AnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coach, setCoach] = useState<CoachComment | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [rotation, setRotation] = useState("");
  const [routeIndex, setRouteIndex] = useState(0);
  const [playback, setPlayback] = useState<PlaybackSelection | null>(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = useCallback((scramble: string) => {
    startTransition(async () => {
      setError(null);
      try {
        const res = await analyze(scramble);
        const best = res.best_orientation;
        setData(res);
        setInput(res.scramble);
        setCoach(res.coach);
        setRotation(best.rotation);
        setRouteIndex(0);
        setActiveSlot(best.best_route.first_pair.rul_alg ? best.best_route.first_pair.slot : null);
        setPlayback(routePlayback(res.scramble, best, best.best_route));
        setCoachLoading(true);
        fetchCoach(res.scramble)
          .then((c) => setCoach(c))
          .catch(() => undefined)
          .finally(() => setCoachLoading(false));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }, []);

  useEffect(() => {
    run(SAMPLES[0].scramble);
  }, [run]);

  const orientation = useMemo(
    () => data?.orientations.find((o) => o.rotation === rotation) ?? data?.best_orientation ?? null,
    [data, rotation],
  );
  const route = orientation ? orientation.routes[routeIndex] ?? orientation.best_route : null;

  const selectOrientation = (rot: string) => {
    if (!data) return;
    const o = data.orientations.find((x) => x.rotation === rot);
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

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[minmax(380px,5fr)_7fr]">
      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            CubeMaster <span className="text-emerald-400">C+1</span> 智能复盘
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Sub-15 进阶：四向观察 · 最优十字 · 首组 &lt;R,U,L&gt; 无转体好块 · AI 教练点评
          </p>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(input);
          }}
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
        >
          <label htmlFor="scramble" className="text-xs font-medium uppercase tracking-wider text-slate-400">
            WCA 打乱（白顶绿前）
          </label>
          <textarea
            id="scramble"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            spellCheck={false}
            className="mt-2 w-full resize-none rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-emerald-400/60"
            placeholder="R U R' U' ..."
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-200 disabled:opacity-50"
            >
              {pending ? "分析中…" : "分析 C+1"}
            </button>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setInput(s.scramble);
                  run(s.scramble);
                }}
                className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                {s.label}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>}
        </form>

        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-slate-800/40 to-slate-900/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-200">{playback?.title ?? "3D 演示"}</span>
            {data && <span className="text-[11px] text-slate-500">分析耗时 {data.elapsed_ms} ms</span>}
          </div>
          <CubePlayer setupAlg={playback?.setupAlg ?? ""} alg={playback ? playbackAlg(playback) : ""} />
          {playback && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {playback.segments.map((s, i) => (
                <span key={i} className={`rounded-lg px-2 py-1 text-xs ${TONE_STYLES[s.tone]}`}>
                  <span className="opacity-70">{s.label}</span> <span className="font-mono">{s.alg}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {data && orientation && route ? (
          <>
            {coach && <CoachCard coach={coach} loading={coachLoading} />}

            <Section title="① 15 秒观察：四向白底起手推荐" aside="综合分 = 40% 十字手感 + 60% 首组 C+1">
              <OrientationRanking orientations={data.orientations} selected={rotation} onSelect={selectOrientation} />
            </Section>

            <Section
              title={
                orientation.rotation === data.best_orientation.rotation && routeIndex === 0
                  ? "② 最佳 C+1 路线"
                  : `② ${orientation.label} 的 C+1 路线`
              }
              aside={route.verified ? "✓ 引擎复核：十字 + 首组已还原" : undefined}
            >
              <RouteSummary orientation={orientation} route={route} routes={orientation.routes} onSelectRoute={selectRoute} />
            </Section>

            <Section title="③ 四槽首组诊断（Good EO · ≤6 步为顺手好块）" aside="点击卡片在 3D 魔方上演示">
              <PairCards pairs={route.pairs} activeSlot={activeSlot} onPlay={playPair} />
            </Section>

            <Section title="④ 十字收尾 AUF 插入优化" aside={`${data.insertion_highlights.length} 个机会`}>
              <InsertionCards
                highlights={data.insertion_highlights}
                selectedRotation={rotation}
                onPlay={(h) => {
                  setActiveSlot(null);
                  setPlayback(highlightPlayback(data.scramble, h));
                }}
              />
            </Section>
          </>
        ) : (
          <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-white/10 text-sm text-slate-500">
            {pending ? "正在计算四个朝向的最优十字与首组…" : error ? "请先启动后端，或修正打乱后重试" : "输入打乱开始分析"}
          </div>
        )}
      </div>
    </div>
  );
}
