"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRandomScramble } from "@/lib/api";
import type { CsTimerSolve, PenaltyType } from "@/lib/types";

const STORAGE_KEY = "cubemaster_cstimer_solves_v2";
const HOLD_THRESHOLD_MS = 300;

type TimerState = "idle" | "inspecting" | "holding" | "ready" | "running";

function formatTime(ms: number | null, penalty: PenaltyType = "OK"): string {
  if (ms === null || Number.isNaN(ms)) return "-";
  if (penalty === "DNF") return "DNF";
  const effective = penalty === "+2" ? ms + 2000 : ms;
  const totalSec = effective / 1000;
  if (totalSec >= 60) {
    const mins = Math.floor(totalSec / 60);
    const secs = (totalSec % 60).toFixed(2).padStart(5, "0");
    return `${mins}:${secs}${penalty === "+2" ? "+" : ""}`;
  }
  return `${totalSec.toFixed(2)}${penalty === "+2" ? "+" : ""}`;
}

function effectiveMs(s: CsTimerSolve): number | null {
  if (s.penalty === "DNF") return null;
  return s.penalty === "+2" ? s.timeMs + 2000 : s.timeMs;
}

function calcMo3(solves: CsTimerSolve[]): number | null {
  if (solves.length < 3) return null;
  const slice = solves.slice(0, 3).map(effectiveMs);
  if (slice.some((v) => v === null)) return null;
  const nums = slice as number[];
  return (nums[0] + nums[1] + nums[2]) / 3;
}

function calcTrimmedAvg(solves: CsTimerSolve[], n: number): number | null {
  if (solves.length < n) return null;
  const slice = solves.slice(0, n).map(effectiveMs);
  const dnfCount = slice.filter((v) => v === null).length;
  if (dnfCount >= 2) return null;
  const sorted = slice
    .map((v) => (v === null ? Number.POSITIVE_INFINITY : v))
    .sort((a, b) => a - b);
  const middle = sorted.slice(1, n - 1);
  return middle.reduce((acc, v) => acc + v, 0) / middle.length;
}

function playBeep(freq = 880, durationMs = 120) {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      ctx.close().catch(() => undefined);
    }, durationMs);
  } catch {
    // Ignore audio context restrictions
  }
}

interface Props {
  initialScramble: string;
  onJumpToAnalyze: (scramble: string) => void;
}

export default function CsTimerPage({ initialScramble, onJumpToAnalyze }: Props) {
  const [scrambleHistory, setScrambleHistory] = useState<string[]>([initialScramble]);
  const [scrambleIdx, setScrambleIdx] = useState(0);
  const currentScramble = scrambleHistory[scrambleIdx] ?? initialScramble;

  const [useInspection, setUseInspection] = useState<boolean>(false);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [inspectionElapsed, setInspectionElapsed] = useState<number>(0);
  const [solveMs, setSolveMs] = useState<number>(0);
  const [solves, setSolves] = useState<CsTimerSolve[]>([]);
  const [selectedSolve, setSelectedSolve] = useState<CsTimerSolve | null>(null);

  const stateRef = useRef<TimerState>("idle");
  stateRef.current = timerState;

  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solveStartRef = useRef<number>(0);
  const inspectStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);
  const inspectIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beep8Ref = useRef(false);
  const beep12Ref = useRef(false);

  // Load saved solves
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CsTimerSolve[];
        if (Array.isArray(parsed)) setSolves(parsed);
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const saveSolves = useCallback((next: CsTimerSolve[]) => {
    setSolves(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  }, []);

  const nextScramble = useCallback(async () => {
    if (scrambleIdx < scrambleHistory.length - 1) {
      setScrambleIdx((i) => i + 1);
      return;
    }
    const s = await fetchRandomScramble(20);
    setScrambleHistory((prev) => [...prev, s]);
    setScrambleIdx((i) => i + 1);
  }, [scrambleHistory.length, scrambleIdx]);

  const prevScramble = useCallback(() => {
    if (scrambleIdx > 0) setScrambleIdx((i) => i - 1);
  }, [scrambleIdx]);

  const clearTimers = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (inspectIntervalRef.current) clearInterval(inspectIntervalRef.current);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  const startInspection = useCallback(() => {
    clearTimers();
    setInspectionElapsed(0);
    beep8Ref.current = false;
    beep12Ref.current = false;
    inspectStartRef.current = performance.now();
    setTimerState("inspecting");

    inspectIntervalRef.current = setInterval(() => {
      const sec = (performance.now() - inspectStartRef.current) / 1000;
      setInspectionElapsed(sec);
      if (sec >= 8 && !beep8Ref.current) {
        beep8Ref.current = true;
        playBeep(660, 110);
      }
      if (sec >= 12 && !beep12Ref.current) {
        beep12Ref.current = true;
        playBeep(880, 140);
        setTimeout(() => playBeep(880, 140), 170);
      }
    }, 50);
  }, [clearTimers]);

  const startRunning = useCallback(() => {
    if (inspectIntervalRef.current) clearInterval(inspectIntervalRef.current);
    solveStartRef.current = performance.now();
    setSolveMs(0);
    setTimerState("running");

    const tick = () => {
      setSolveMs(performance.now() - solveStartRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const finishSolve = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const finalMs = Math.round(performance.now() - solveStartRef.current);
    setSolveMs(finalMs);
    setTimerState("idle");

    let autoPenalty: PenaltyType = "OK";
    if (useInspection) {
      if (inspectionElapsed >= 17) autoPenalty = "DNF";
      else if (inspectionElapsed >= 15) autoPenalty = "+2";
    }

    const record: CsTimerSolve = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      scramble: currentScramble,
      timeMs: finalMs,
      penalty: autoPenalty,
    };
    saveSolves([record, ...solves]);
    nextScramble();
  }, [currentScramble, inspectionElapsed, nextScramble, saveSolves, solves, useInspection]);

  // Spacebar / Keyboard handler (csTimer style)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }

      if (stateRef.current === "running") {
        e.preventDefault();
        finishSolve();
        return;
      }

      if (e.code === "Escape" && stateRef.current === "inspecting") {
        e.preventDefault();
        clearTimers();
        setTimerState("idle");
        return;
      }

      if (e.code !== "Space") return;
      e.preventDefault();
      if (e.repeat) return;

      if (stateRef.current === "idle") {
        if (useInspection) {
          startInspection();
        } else {
          setTimerState("holding");
          holdTimerRef.current = setTimeout(() => {
            setTimerState("ready");
          }, HOLD_THRESHOLD_MS);
        }
      } else if (stateRef.current === "inspecting") {
        setTimerState("holding");
        holdTimerRef.current = setTimeout(() => {
          setTimerState("ready");
        }, HOLD_THRESHOLD_MS);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const st = stateRef.current;
      if (st === "holding") {
        if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        setTimerState(useInspection && inspectionElapsed > 0 ? "inspecting" : "idle");
      } else if (st === "ready") {
        startRunning();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [clearTimers, finishSolve, inspectionElapsed, startInspection, startRunning, useInspection]);

  // Pointer/Touch handlers for clicking/touching the central timer area
  const handlePadPointerDown = () => {
    if (timerState === "running") {
      finishSolve();
      return;
    }
    if (timerState === "idle") {
      if (useInspection) {
        startInspection();
      } else {
        setTimerState("holding");
        holdTimerRef.current = setTimeout(() => setTimerState("ready"), HOLD_THRESHOLD_MS);
      }
    } else if (timerState === "inspecting") {
      setTimerState("holding");
      holdTimerRef.current = setTimeout(() => setTimerState("ready"), HOLD_THRESHOLD_MS);
    }
  };

  const handlePadPointerUp = () => {
    if (timerState === "holding") {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      setTimerState(useInspection && inspectionElapsed > 0 ? "inspecting" : "idle");
    } else if (timerState === "ready") {
      startRunning();
    }
  };

  // Update latest solve penalty or delete
  const updatePenalty = (id: string, penalty: PenaltyType) => {
    saveSolves(solves.map((s) => (s.id === id ? { ...s, penalty } : s)));
  };

  const deleteSolve = (id: string) => {
    saveSolves(solves.filter((s) => s.id !== id));
    if (selectedSolve?.id === id) setSelectedSolve(null);
  };

  // Session statistics (csTimer table)
  const stats = useMemo(() => {
    const valid = solves.map(effectiveMs).filter((v): v is number => v !== null);
    const currentSingle = solves[0] ? effectiveMs(solves[0]) : null;
    const bestSingle = valid.length > 0 ? Math.min(...valid) : null;
    const mo3 = calcMo3(solves);
    const ao5 = calcTrimmedAvg(solves, 5);
    const ao12 = calcTrimmedAvg(solves, 12);
    const mean = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

    let bestAo5: number | null = null;
    for (let i = 0; i <= solves.length - 5; i++) {
      const a = calcTrimmedAvg(solves.slice(i, i + 5), 5);
      if (a !== null && (bestAo5 === null || a < bestAo5)) bestAo5 = a;
    }
    let bestAo12: number | null = null;
    for (let i = 0; i <= solves.length - 12; i++) {
      const a = calcTrimmedAvg(solves.slice(i, i + 12), 12);
      if (a !== null && (bestAo12 === null || a < bestAo12)) bestAo12 = a;
    }

    return {
      totalCount: solves.length,
      validCount: valid.length,
      currentSingle,
      bestSingle,
      mo3,
      ao5,
      bestAo5,
      ao12,
      bestAo12,
      mean,
    };
  }, [solves]);

  const latestSolve = solves[0] ?? null;
  const isBusy = timerState === "running" || timerState === "inspecting" || timerState === "holding" || timerState === "ready";
  const inspectRemain = Math.max(0, Math.ceil(15 - inspectionElapsed));

  return (
    <div className="flex min-h-[calc(100vh-64px)] flex-col bg-slate-950 text-slate-100 select-none">
      {/* Top Scramble Bar (csTimer style) */}
      <div
        className={`border-b border-white/10 bg-slate-900/80 px-6 py-4 transition-opacity duration-200 ${
          timerState === "running" ? "opacity-10 pointer-events-none" : "opacity-100"
        }`}
      >
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-3">
          <div className="text-center font-mono text-xl font-bold tracking-wider text-amber-100 sm:text-2xl md:text-3xl">
            {currentScramble}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
            <button
              type="button"
              onClick={prevScramble}
              disabled={scrambleIdx === 0}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-40"
            >
              ← 上一把打乱
            </button>
            <button
              type="button"
              onClick={nextScramble}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
            >
              下一把新打乱 →
            </button>
            <button
              type="button"
              onClick={() => setUseInspection((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 font-medium transition ${
                useInspection
                  ? "border-amber-400/50 bg-amber-500/20 text-amber-200"
                  : "border-white/10 bg-white/5 text-slate-400 hover:text-slate-200"
              }`}
            >
              WCA 15秒观察：{useInspection ? "已开启" : "关闭"}
            </button>
            <button
              type="button"
              onClick={() => onJumpToAnalyze(currentScramble)}
              className="rounded-lg bg-emerald-500/20 px-3.5 py-1.5 font-semibold text-emerald-200 ring-1 ring-emerald-400/40 hover:bg-emerald-500/30"
            >
              🔍 去看这把打乱的 C+1 解法
            </button>
          </div>
        </div>
      </div>

      {/* Main Content: Left Stats Sidebar + Huge Center Timer */}
      <div className="mx-auto grid w-full max-w-[1500px] flex-1 grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Left Sidebar: csTimer Statistics & Solve History */}
        <aside
          className={`flex flex-col border-t border-white/10 bg-slate-900/40 p-4 lg:border-t-0 lg:border-r transition-opacity duration-200 order-2 lg:order-1 ${
            isBusy ? "opacity-15 pointer-events-none" : "opacity-100"
          }`}
        >
          {/* csTimer Statistics Table */}
          <div className="rounded-xl border border-white/10 bg-black/30 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">
                统计 ({stats.validCount}/{stats.totalCount})
              </span>
              {stats.mean !== null && <span>总平均: {formatTime(stats.mean)}</span>}
            </div>
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="py-1 text-left font-normal">指标</th>
                  <th className="py-1 text-right font-normal">当前 (Current)</th>
                  <th className="py-1 text-right font-normal">最佳 (Best)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200">
                <tr>
                  <td className="py-1.5 text-slate-400">time</td>
                  <td className="py-1.5 text-right">{formatTime(stats.currentSingle)}</td>
                  <td className="py-1.5 text-right text-emerald-300 font-semibold">
                    {formatTime(stats.bestSingle)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-slate-400">mo3</td>
                  <td className="py-1.5 text-right">{formatTime(stats.mo3)}</td>
                  <td className="py-1.5 text-right">—</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-slate-400">ao5</td>
                  <td className="py-1.5 text-right font-semibold text-sky-300">
                    {formatTime(stats.ao5)}
                  </td>
                  <td className="py-1.5 text-right text-emerald-300">
                    {formatTime(stats.bestAo5)}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-slate-400">ao12</td>
                  <td className="py-1.5 text-right font-semibold text-violet-300">
                    {formatTime(stats.ao12)}
                  </td>
                  <td className="py-1.5 text-right text-emerald-300">
                    {formatTime(stats.bestAo12)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Solve List Table */}
          <div className="mt-4 flex flex-1 flex-col min-h-[260px]">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-200">成绩列表（点击可复盘）</span>
              {solves.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    saveSolves([]);
                    setSelectedSolve(null);
                  }}
                  className="text-rose-400/80 hover:text-rose-300"
                >
                  清空全部
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/25">
              {solves.length === 0 ? (
                <div className="flex h-40 items-center justify-center p-4 text-center text-xs text-slate-500">
                  暂无成绩，按住空格键开始第一把计时
                </div>
              ) : (
                <table className="w-full text-xs font-mono">
                  <thead className="sticky top-0 bg-slate-900 text-slate-400">
                    <tr>
                      <th className="px-2.5 py-1.5 text-left font-normal">#</th>
                      <th className="px-2.5 py-1.5 text-right font-normal">单次</th>
                      <th className="px-2.5 py-1.5 text-right font-normal">ao5</th>
                      <th className="px-2.5 py-1.5 text-right font-normal">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {solves.map((s, idx) => {
                      const num = solves.length - idx;
                      const rowAo5 = calcTrimmedAvg(solves.slice(idx, idx + 5), 5);
                      return (
                        <tr
                          key={s.id}
                          onClick={() => setSelectedSolve(s)}
                          className={`cursor-pointer transition hover:bg-white/5 ${
                            selectedSolve?.id === s.id ? "bg-emerald-500/15" : ""
                          }`}
                        >
                          <td className="px-2.5 py-1.5 text-slate-500">{num}</td>
                          <td
                            className={`px-2.5 py-1.5 text-right font-semibold ${
                              s.penalty === "DNF"
                                ? "text-rose-400"
                                : s.penalty === "+2"
                                  ? "text-amber-300"
                                  : "text-slate-100"
                            }`}
                          >
                            {formatTime(s.timeMs, s.penalty)}
                          </td>
                          <td className="px-2.5 py-1.5 text-right text-slate-400">
                            {formatTime(rowAo5)}
                          </td>
                          <td
                            className="px-2.5 py-1.5 text-right"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => onJumpToAnalyze(s.scramble)}
                              className="mr-1.5 text-emerald-300 hover:underline font-sans"
                              title="分析这把 C+1"
                            >
                              复盘
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSolve(s.id)}
                              className="text-slate-500 hover:text-rose-400"
                              title="删除"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </aside>

        {/* Center Main Timer Canvas */}
        <div
          onPointerDown={handlePadPointerDown}
          onPointerUp={handlePadPointerUp}
          className="order-1 lg:order-2 flex min-h-[420px] flex-1 cursor-pointer flex-col items-center justify-center p-6"
        >
          {/* Main Digital Readout */}
          <div
            className={`font-mono font-bold tabular-nums tracking-tight transition-colors ${
              timerState === "ready"
                ? "text-emerald-400"
                : timerState === "holding"
                  ? "text-rose-400"
                  : timerState === "inspecting"
                    ? inspectionElapsed >= 12
                      ? "text-rose-400"
                      : "text-amber-300"
                    : "text-white"
            } text-7xl sm:text-8xl md:text-9xl`}
          >
            {timerState === "inspecting" || (timerState !== "running" && useInspection && inspectionElapsed > 0 && timerState !== "idle") ? (
              inspectionElapsed >= 17 ? (
                "DNF"
              ) : inspectionElapsed >= 15 ? (
                "+2"
              ) : (
                inspectRemain
              )
            ) : timerState === "running" ? (
              (solveMs / 1000).toFixed(2)
            ) : latestSolve && solveMs > 0 ? (
              formatTime(latestSolve.timeMs, latestSolve.penalty)
            ) : (
              "0.00"
            )}
          </div>

          {/* Status Prompt under Timer */}
          <div className="mt-4 text-sm text-slate-400">
            {timerState === "idle" &&
              (useInspection
                ? "按一下空格键（或点击屏幕）开始 15 秒观察"
                : "长按空格键 0.3 秒（变绿后松开）开始计时")}
            {timerState === "inspecting" && "观察中：长按空格键 0.3 秒（变绿松开）开表 · 按 Esc 取消"}
            {timerState === "holding" && "继续按住等待变绿…"}
            {timerState === "ready" && "松开开始计时！"}
            {timerState === "running" && "按任意键或点击屏幕停表"}
          </div>

          {/* Post-solve quick action bar (csTimer style) */}
          {!isBusy && latestSolve && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-8 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-900/80 px-4 py-2.5"
            >
              <span className="mr-1 text-xs text-slate-400">上把成绩操作：</span>
              {(["OK", "+2", "DNF"] as PenaltyType[]).map((pen) => (
                <button
                  key={pen}
                  type="button"
                  onClick={() => updatePenalty(latestSolve.id, pen)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold transition ${
                    latestSolve.penalty === pen
                      ? "bg-amber-400 text-slate-950"
                      : "bg-white/5 text-slate-300 hover:bg-white/10"
                  }`}
                >
                  {pen}
                </button>
              ))}
              <button
                type="button"
                onClick={() => deleteSolve(latestSolve.id)}
                className="rounded-lg bg-white/5 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/20"
              >
                删除
              </button>
              <button
                type="button"
                onClick={() => onJumpToAnalyze(latestSolve.scramble)}
                className="rounded-lg bg-emerald-400 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-emerald-300"
              >
                🔍 复盘这把 C+1 解法
              </button>
            </div>
          )}

          {/* Selected historical solve detail popup */}
          {!isBusy && selectedSolve && (
            <div
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              className="mt-4 max-w-xl rounded-xl border border-white/10 bg-slate-900/90 p-4 text-xs text-slate-300 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white">
                  成绩详情：{formatTime(selectedSolve.timeMs, selectedSolve.penalty)}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedSolve(null)}
                  className="text-slate-400 hover:text-white"
                >
                  关闭 ✕
                </button>
              </div>
              <div className="font-mono text-amber-200">{selectedSolve.scramble}</div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onJumpToAnalyze(selectedSolve.scramble)}
                  className="rounded-lg bg-emerald-400 px-3 py-1 font-bold text-slate-950 hover:bg-emerald-300"
                >
                  🔍 去分析这把 C+1 解法
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
