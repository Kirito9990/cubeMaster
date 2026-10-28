"use client";

import { useEffect, useRef, useState } from "react";
import type { TwistyPlayer } from "cubing/twisty";

interface Props {
  setupAlg: string;
  alg: string;
}

export default function CubePlayer({ setupAlg, alg }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwistyPlayer | null>(null);
  const latest = useRef({ setupAlg, alg });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    latest.current = { setupAlg, alg };
    const player = playerRef.current;
    if (!player) return;
    player.experimentalSetupAlg = setupAlg;
    player.alg = alg;
    player.jumpToStart();
  }, [setupAlg, alg]);

  useEffect(() => {
    let cancelled = false;
    import("cubing/twisty")
      .then(({ TwistyPlayer }) => {
        if (cancelled || !hostRef.current) return;
        const player = new TwistyPlayer({
          puzzle: "3x3x3",
          experimentalSetupAlg: latest.current.setupAlg,
          alg: latest.current.alg,
          background: "none",
          controlPanel: "bottom-row",
          hintFacelets: "floating",
          tempoScale: 1.6,
        });
        player.style.width = "100%";
        player.style.height = "100%";
        hostRef.current.appendChild(player);
        playerRef.current = player;
        setReady(true);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      playerRef.current?.remove();
      playerRef.current = null;
    };
  }, []);

  const replay = () => {
    const p = playerRef.current;
    if (!p) return;
    p.jumpToStart();
    p.play();
  };

  return (
    <div>
      <div ref={hostRef} className="relative h-[340px]">
        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-slate-400">加载 3D 魔方…</div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-rose-300">cubing.js 加载失败：{error}</div>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={replay}
          disabled={!ready}
          className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:opacity-40"
        >
          ▶ 连续播放 Cross + 首组
        </button>
        <button
          type="button"
          onClick={() => playerRef.current?.jumpToEnd()}
          disabled={!ready}
          className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/5 disabled:opacity-40"
        >
          跳到结果
        </button>
      </div>
    </div>
  );
}
