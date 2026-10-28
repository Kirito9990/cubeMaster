"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alg, Badge, COLOR_SWATCH } from "@/components/tutor";
import type {
  AnalyzeResponse,
  CrossColorName,
  PenaltyType,
  SlotName,
  SolveRecord,
  TrainingDrillMode,
} from "@/lib/types";

interface Props {
  scramble: string;
  analysis: AnalyzeResponse | null;
  onNewScramble: () => void;
  onLoadScramble: (s: string) => void;
  onMaskChange: (masked: boolean) => void;
  onPlayOptimal: () => void;
}

const STORAGE_KEY = "cubemaster_timer_solves_v2";
const ALL_COLORS: CrossColorName[] = ["white", "yellow", "green", "blue", "red", "orange"];
const ALL_SLOTS: SlotName[] = ["FR", "FL", "BR", "BL"];

export function formatTimeMs(ms: number | null, penalty: PenaltyType = "OK"): string {
  if (ms === null || penalty === "DNF") return "DNF";
  const effective = penalty === "+2" ? ms + 2000 : ms;
  const s = (effective / 1000).toFixed(2);
  return penalty === "+2" ? `${s}+` : s;
}

function calcAoN(records: SolveRecord[], n: number): string {
  if (records.length < n) return "—";
  const slice = records.slice(0, n);
  const dnfCount = slice.filter((r) => r.penalty === "DNF").length;
  if (dnfCount >= 2) return "DNF";
  const values = slice.map((r) =>
    r.penalty === "DNF" ? Infinity : r.timeMs + (r.penalty === "+2" ? 2000 : 0),
  );
  values.sort((a, b) => a - b);
  const trimmed = values.slice(1, n - 1);
  const avg = trimmed.reduce((acc, v) => acc + v, 0) / trimmed.length;
  return (avg / 1000).toFixed(2);
}

function playBeep(freq = 880, durationMs = 110) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => undefined);
    }, durationMs);
  } catch {
    // Ignore audio errors before user gesture
  }
}

export default function TimerTrainer({
  scramble,
  analysis,
  onNewScramble,
  onLoadScramble,
  onMaskChange,
  onPlayOptimal,
}: Props) {
  const [drillMode, setDrillMode] = useState<TrainingDrillMode>("c1");
  const [useInspection, setUseInspection] = useState(true);
  const [useBlindMask, setUseBlindMask] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const [phase, setPhase] = useState<"idle" | "inspecting" | "holding" | "ready" | "running">("idle");
  const [inspectionElapsed, setInspectionElapsed] = useState(0);
  const [displayMs, setDisplayMs] = useState(0);
  const [solves, setSolves] = useState<SolveRecord[]>([]);

  const [chosenColor, setChosenColor] = useState<CrossColorName>("white");
  const [chosenSlot, setChosenSlot] = useState<SlotName>("BL");

  const startTimeRef = useRef<number>(0);
  const inspectStartRef = useRef<number>(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const inspectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beeped8Ref = useRef(false);
  const beeped12Ref = useRef(false);

  // Load saved solves from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SolveRecord[];
        if (Array.isArray(parsed)) setSolves(parsed);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const saveSolves = useCallback((next: SolveRecord[]) => {
    setSolves(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  }, []);

  // Sync default chosenColor/chosenSlot when new analysis arrives
  useEffect(() => {
    if (analysis) {
      setChosenColor(analysis.cross_color);
      setChosenSlot(analysis.best_route.first_pair.slot);
    }
  }, [analysis]);

  // Lookup score for user's chosen (color, slot)
  const evaluateChoice = useCallback(
    (col: CrossColorName, slot: SlotName) => {
      if (!analysis) {
        return {
          optimalColor: "white" as CrossColorName,
          optimalSlot: "BL" as SlotName,
          optimalScore: 100,
          chosenScore: 90,
        };
      }
      const optO = analysis.global_best_orientation ?? analysis.best_orientation;
      const optimalColor = optO.cross_color;
      const optimalSlot = optO.best_route.first_pair.slot;
      const optimalScore = optO.best_route.total_score;

      const summary = analysis.color_summaries.find((s) => s.cross_color === col);
      let chosenScore = 70.0;
      if (summary) {
        const scores: number[] = [];
        for (const o of summary.orientations) {
          for (const r of o.routes) {
            const p = r.pairs.find((x) => x.slot === slot);
            if (p) {
              scores.push(Math.round((0.4 * r.cross_ergonomic_score + 0.6 * p.c1_score) * 10) / 10);
            }
          }
        }
        if (scores.length > 0) chosenScore = Math.max(...scores);
      }
      return { optimalColor, optimalSlot, optimalScore, chosenScore };
    },
    [analysis],
  );

  const stopInspectionTimer = useCallback(() => {
    if (inspectIntervalRef.current) {
      clearInterval(inspectIntervalRef.current);
      inspectIntervalRef.current = null;
    }
  }, []);

  const startInspection = useCallback(() => {
    stopInspectionTimer();
    inspectStartRef.current = performance.now();
    beeped8Ref.current = false;
    beeped12Ref.current = false;
    setInspectionElapsed(0);
    setPhase("inspecting");
    onMaskChange(false);
    if (soundEnabled) playBeep(660, 80);

    inspectIntervalRef.current = setInterval(() => {
      const sec = (performance.now() - inspectStartRef.current) / 1000;
      setInspectionElapsed(sec);
      if (sec >= 8 && !beeped8Ref.current) {
        beeped8Ref.current = true;
        if (soundEnabled) playBeep(880, 120);
      }
      if (sec >= 12 && !beeped12Ref.current) {
        beeped12Ref.current = true;
        if (soundEnabled) {
          playBeep(1100, 100);
          setTimeout(() => playBeep(1100, 100), 150);
        }
      }
    }, 50);
  }, [onMaskChange, soundEnabled, stopInspectionTimer]);

  const startRunning = useCallback(() => {
    const inspSec = phase === "inspecting" || inspectionElapsed > 0 ? inspectionElapsed : 0;
    stopInspectionTimer();
    startTimeRef.current = performance.now();
    setPhase("running");
    if (useBlindMask) onMaskChange(true);
    if (soundEnabled) playBeep(1046, 90);

    const tick = () => {
      setDisplayMs(Math.round(performance.now() - startTimeRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return inspSec;
  }, [inspectionElapsed, onMaskChange, phase, soundEnabled, stopInspectionTimer, useBlindMask]);

  const stopRunning = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const finalMs = Math.max(10, Math.round(performance.now() - startTimeRef.current));
    setDisplayMs(finalMs);
    setPhase("idle");
    onMaskChange(false);
    if (soundEnabled) playBeep(523, 120);

    let penalty: PenaltyType = "OK";
    if (useInspection && inspectionElapsed >= 17) penalty = "DNF";
    else if (useInspection && inspectionElapsed >= 15) penalty = "+2";

    const evalRes = evaluateChoice(chosenColor, chosenSlot);
    const rec: SolveRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      scramble,
      timeMs: finalMs,
      inspectionSec: Math.round(inspectionElapsed * 10) / 10,
      penalty,
      drillMode,
      blindMaskUsed: useBlindMask,
      chosenColor,
      chosenSlot,
      ...evalRes,
    };
    saveSolves([rec, ...solves]);
    setInspectionElapsed(0);
  }, [
    chosenColor,
    chosenSlot,
    drillMode,
    evaluateChoice,
    inspectionElapsed,
    onMaskChange,
    saveSolves,
    scramble,
    solves,
    soundEnabled,
    useBlindMask,
    useInspection,
  ]);

  const beginHold = useCallback(() => {
    if (phase === "running") {
      stopRunning();
      return;
    }
    if (useInspection && phase === "idle") {
      startInspection();
      return;
    }
    setPhase("holding");
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      setPhase("ready");
    }, 280);
  }, [phase, startInspection, stopRunning, useInspection]);

  const releaseHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (phase === "ready") {
      startRunning();
    } else if (phase === "holding") {
      setPhase(inspectionElapsed > 0 ? "inspecting" : "idle");
    }
  }, [inspectionElapsed, phase, startRunning]);

  // Spacebar listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (e.repeat) return;
        if (phase === "running") {
          stopRunning();
        } else if (useInspection && phase === "idle") {
          startInspection();
        } else if (phase === "idle" || phase === "inspecting") {
          beginHold();
        }
      } else if (phase === "running") {
        e.preventDefault();
        stopRunning();
      } else if (e.code === "Escape" && phase === "inspecting") {
        stopInspectionTimer();
        setInspectionElapsed(0);
        setPhase("idle");
        onMaskChange(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "holding" || phase === "ready") {
          releaseHold();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [beginHold, onMaskChange, phase, releaseHold, startInspection, stopInspectionTimer, stopRunning, useInspection]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (inspectIntervalRef.current) clearInterval(inspectIntervalRef.current);
    };
  }, []);

  const updateLatestChoice = (col: CrossColorName, slot: SlotName) => {
    setChosenColor(col);
    setChosenSlot(slot);
    if (solves.length === 0) return;
    const latest = solves[0];
    if (latest.scramble !== scramble) return;
    const evalRes = evaluateChoice(col, slot);
    const updated: SolveRecord = {
      ...latest,
      chosenColor: col,
      chosenSlot: slot,
      ...evalRes,
    };
    saveSolves([updated, ...solves.slice(1)]);
  };

  const setPenaltyOnSolve = (id: string, penalty: PenaltyType) => {
    saveSolves(solves.map((s) => (s.id === id ? { ...s, penalty } : s)));
  };

  const deleteSolve = (id: string) => {
    saveSolves(solves.filter((s) => s.id !== id));
  };

  const clearAllSolves = () => {
    saveSolves([]);
    setDisplayMs(0);
  };

  const stats = useMemo(() => {
    const valid = solves.filter((s) => s.penalty !== "DNF");
    const effectiveMs = valid.map((s) => s.timeMs + (s.penalty === "+2" ? 2000 : 0));
    const best = effectiveMs.length > 0 ? (Math.min(...effectiveMs) / 1000).toFixed(2) : "—";
    const mean =
      effectiveMs.length > 0
        ? (effectiveMs.reduce((a, b) => a + b, 0) / effectiveMs.length / 1000).toFixed(2)
        : "—";
    const ao5 = calcAoN(solves, 5);
    const ao12 = calcAoN(solves, 12);
    const matchCount = solves.filter(
      (s) => s.chosenColor === s.optimalColor && s.chosenSlot === s.optimalSlot,
    ).length;
    const matchRate = solves.length > 0 ? `${Math.round((matchCount / solves.length) * 100)}%` : "—";
    return { best, mean, ao5, ao12, matchRate };
  }, [solves]);

  const latestSolve = solves[0] ?? null;
  const remainingInspection = Math.max(0, 15 - inspectionElapsed);

  return (
    <div className="space-y-5">
      {/* 顶部训练参数配置栏 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">⏱️ 训练科目:</span>
            <button
              onClick={() => setDrillMode("c1")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                drillMode === "c1"
                  ? "bg-emerald-600 text-white"
                  : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              🎯 C+1 专项爆发 (十字+首组即停)
            </button>
            <button
              onClick={() => setDrillMode("full")}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                drillMode === "full"
                  ? "bg-sky-600 text-white"
                  : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              🏆 完整 3x3 还原计时
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => setUseInspection((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 font-medium transition ${
                useInspection
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                  : "border-slate-800 bg-slate-950 text-slate-500"
              }`}
            >
              {useInspection ? "✓ WCA 15s 观察" : "○ WCA 15s 观察"}
            </button>
            <button
              onClick={() => setUseBlindMask((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 font-medium transition ${
                useBlindMask
                  ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                  : "border-slate-800 bg-slate-950 text-slate-500"
              }`}
            >
              {useBlindMask ? "✓ 计时盲拧遮罩" : "○ 计时盲拧遮罩"}
            </button>
            <button
              onClick={() => setSoundEnabled((v) => !v)}
              className={`rounded-lg border px-2.5 py-1.5 font-medium transition ${
                soundEnabled
                  ? "border-sky-500/50 bg-sky-500/15 text-sky-300"
                  : "border-slate-800 bg-slate-950 text-slate-500"
              }`}
            >
              {soundEnabled ? "🔊 8s/12s 提示音" : "🔇 静音"}
            </button>
          </div>
        </div>
      </div>

      {/* 主计时触控大屏 */}
      <div
        onMouseDown={beginHold}
        onMouseUp={releaseHold}
        onTouchStart={(e) => {
          e.preventDefault();
          beginHold();
        }}
        onTouchEnd={(e) => {
          e.preventDefault();
          releaseHold();
        }}
        className={`select-none cursor-pointer rounded-2xl border p-8 text-center transition-all shadow-2xl ${
          phase === "ready"
            ? "border-emerald-400 bg-emerald-950/40 ring-2 ring-emerald-400/50"
            : phase === "holding"
              ? "border-amber-400 bg-amber-950/30 ring-1 ring-amber-400/40"
              : phase === "inspecting"
                ? "border-sky-500/60 bg-sky-950/30"
                : phase === "running"
                  ? "border-emerald-500/50 bg-slate-900/95"
                  : "border-slate-800 bg-slate-900/90 hover:border-slate-700"
        }`}
      >
        <div className="flex items-center justify-center gap-2 mb-2">
          <Badge tone={drillMode === "c1" ? "emerald" : "sky"}>
            {drillMode === "c1" ? "C+1 专项规划计时" : "WCA 完整三阶计时"}
          </Badge>
          {phase === "inspecting" && (
            <Badge tone={inspectionElapsed >= 12 ? "rose" : inspectionElapsed >= 8 ? "amber" : "sky"}>
              {inspectionElapsed >= 17
                ? "超时 DNF!"
                : inspectionElapsed >= 15
                  ? "超时 +2!"
                  : inspectionElapsed >= 12
                    ? "12 秒告警!"
                    : inspectionElapsed >= 8
                      ? "8 秒已过"
                      : "15s 观察规划中"}
            </Badge>
          )}
        </div>

        <div
          className={`font-mono font-bold tracking-tight transition-colors ${
            phase === "ready"
              ? "text-6xl sm:text-7xl text-emerald-400"
              : phase === "holding"
                ? "text-6xl sm:text-7xl text-amber-300"
                : phase === "inspecting"
                  ? inspectionElapsed >= 12
                    ? "text-6xl sm:text-7xl text-rose-400"
                    : "text-6xl sm:text-7xl text-amber-300"
                  : "text-6xl sm:text-7xl text-slate-100"
          }`}
        >
          {phase === "inspecting"
            ? `${remainingInspection.toFixed(1)}s`
            : (displayMs / 1000).toFixed(2)}
        </div>

        <p className="mt-4 text-xs text-slate-400">
          {phase === "idle" &&
            (useInspection
              ? "按一下【空格键】或点击此处开始 15 秒 WCA 观察期"
              : "长按【空格键】或按住此处 0.3 秒变绿后松手起表")}
          {phase === "inspecting" &&
            "正在观察规划 C+1... 长按【空格键】或按住此处 0.3 秒变绿后松手起表（按 ESC 取消）"}
          {phase === "holding" && "继续按住... 等待指示灯变绿"}
          {phase === "ready" && "🟢 准备就绪！松开立即开始计时！"}
          {phase === "running" && "⚡ 正在计时！完成动作后按任意键或点击此处停表"}
        </p>
      </div>

      {/* 实战决策登记 & 引擎最优路线比对卡 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/75 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              🧭 实战 C+1 决策打卡 vs 引擎最优解复盘
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              标记你本把观察期实际规划的【底色】与【首组槽位】，检验是否抓住了全场最优路线
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onPlayOptimal}
              className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-medium text-sky-300 ring-1 ring-sky-500/40 hover:bg-sky-500/30 transition"
            >
              🎬 在 3D 魔方回放最优 C+1
            </button>
            <button
              onClick={onNewScramble}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 transition"
            >
              🎲 下一把随机打乱
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-400">1. 你实战选择的底色:</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_COLORS.map((c) => {
                const sw = COLOR_SWATCH[c];
                const active = chosenColor === c;
                return (
                  <button
                    key={c}
                    onClick={() => updateLatestChoice(c, chosenSlot)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      active
                        ? "border-sky-400 bg-sky-500/20 text-white"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${sw.dot}`} />
                    <span>{sw.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-2">
            <div className="text-xs font-medium text-slate-400">2. 你实战选择的首组槽位:</div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SLOTS.map((s) => {
                const active = chosenSlot === s;
                return (
                  <button
                    key={s}
                    onClick={() => updateLatestChoice(chosenColor, s)}
                    className={`rounded-lg border px-3 py-1 text-xs font-mono font-semibold transition ${
                      active
                        ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {s} 槽
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {analysis && (
          <div className="rounded-lg border border-sky-500/20 bg-sky-950/15 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-1">
              <div className="text-slate-300">
                引擎推荐最优:{" "}
                <strong className="text-sky-300">
                  {analysis.cross_color_label} · {analysis.best_orientation.label} · 首组{" "}
                  {analysis.best_route.first_pair.slot}
                </strong>{" "}
                (综合分 <strong className="text-emerald-300">{analysis.best_route.total_score}</strong>)
              </div>
              <div className="font-mono text-slate-400">
                最优路线: 观察 <Alg>{analysis.best_orientation.inspection_alg || "原位"}</Alg> → 十字{" "}
                <Alg>{analysis.best_route.cross}</Alg> → 首组{" "}
                <Alg>{analysis.best_route.first_pair.rul_alg || "无"}</Alg>
              </div>
            </div>
            {latestSolve && latestSolve.scramble === scramble && (
              <div className="shrink-0 text-right">
                <Badge
                  tone={
                    latestSolve.chosenColor === latestSolve.optimalColor &&
                    latestSolve.chosenSlot === latestSolve.optimalSlot
                      ? "emerald"
                      : "amber"
                  }
                >
                  {latestSolve.chosenColor === latestSolve.optimalColor &&
                  latestSolve.chosenSlot === latestSolve.optimalSlot
                    ? "🎯 正中全场最优路线！"
                    : `你的路线 ${latestSolve.chosenScore}分 vs 最优 ${latestSolve.optimalScore}分`}
                </Badge>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 统计指标面板 */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {[
          { label: "最佳 Single", value: stats.best, tone: "text-emerald-400" },
          { label: "当前 Ao5", value: stats.ao5, tone: "text-sky-400" },
          { label: "当前 Ao12", value: stats.ao12, tone: "text-violet-400" },
          { label: "Session 平均", value: stats.mean, tone: "text-slate-200" },
          { label: "最优C+1命中率", value: stats.matchRate, tone: "text-amber-300" },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-800 bg-slate-900/70 p-3 text-center"
          >
            <div className="text-[11px] text-slate-400">{item.label}</div>
            <div className={`mt-1 font-mono text-lg font-bold ${item.tone}`}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* 历史成绩列表 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            训练历史记录 ({solves.length})
          </h3>
          {solves.length > 0 && (
            <button
              onClick={clearAllSolves}
              className="text-xs text-rose-400 hover:text-rose-300 transition"
            >
              清空记录
            </button>
          )}
        </div>

        {solves.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            暂无训练记录，按【空格键】完成你的第一把 C+1 规划训练吧！
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {solves.map((s, idx) => {
              const sw = COLOR_SWATCH[s.chosenColor] ?? COLOR_SWATCH.white;
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/90 bg-slate-950/60 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-slate-500">#{solves.length - idx}</span>
                    <span className="font-mono text-sm font-bold text-slate-100">
                      {formatTimeMs(s.timeMs, s.penalty)}s
                    </span>
                    <Badge tone={s.drillMode === "c1" ? "emerald" : "sky"}>
                      {s.drillMode === "c1" ? "C+1" : "3x3"}
                    </Badge>
                    <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                      <span className={`h-2 w-2 rounded-full ${sw.dot}`} />
                      {sw.label}·{s.chosenSlot}
                    </span>
                    {s.chosenColor === s.optimalColor && s.chosenSlot === s.optimalSlot && (
                      <span className="text-emerald-400 font-medium">★最优吻合</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onLoadScramble(s.scramble)}
                      className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 hover:bg-slate-700"
                    >
                      复盘此打乱
                    </button>
                    <button
                      onClick={() => setPenaltyOnSolve(s.id, s.penalty === "+2" ? "OK" : "+2")}
                      className={`rounded px-1.5 py-0.5 font-mono ${
                        s.penalty === "+2" ? "bg-amber-500/30 text-amber-300" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      +2
                    </button>
                    <button
                      onClick={() => setPenaltyOnSolve(s.id, s.penalty === "DNF" ? "OK" : "DNF")}
                      className={`rounded px-1.5 py-0.5 font-mono ${
                        s.penalty === "DNF" ? "bg-rose-500/30 text-rose-300" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      DNF
                    </button>
                    <button
                      onClick={() => deleteSolve(s.id)}
                      className="rounded bg-slate-800 px-1.5 py-0.5 text-rose-400 hover:bg-rose-950"
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
