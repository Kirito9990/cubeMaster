"use client";

import { useEffect, useRef, useState } from "react";
import type { TwistyPlayer } from "cubing/twisty";

interface Props {
  setupAlg: string;
  alg: string;
  masked?: boolean;
}

export default function CubePlayer({ setupAlg, alg, masked = false }: Props) {
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
        hostRef.current.innerHTML = "";
        const player = new TwistyPlayer({
          puzzle: "3x3x3",
          visualization: "3D",
          alg: latest.current.alg,
          experimentalSetupAlg: latest.current.setupAlg,
          background: "none",
          controlPanel: "bottom",
        });
        player.style.width = "100%";
        player.style.height = "100%";
        hostRef.current.appendChild(player);
        playerRef.current = player;
        setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
      if (hostRef.current) hostRef.current.innerHTML = "";
      playerRef.current = null;
    };
  }, []);

  return (
    <div className="relative h-full w-full">
      {!ready && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">
          加载 3D 魔方组件...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-rose-400">
          魔方渲染失败: {error}
        </div>
      )}
      <div ref={hostRef} className="h-full w-full" />
      {masked && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6 text-center transition-all">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-2xl ring-1 ring-amber-400/40">
            🙈
          </div>
          <h3 className="text-sm font-bold text-amber-300">盲打规划遮罩已开启 (Blind C+1 Mode)</h3>
          <p className="mt-1.5 text-xs text-slate-400 max-w-xs leading-relaxed">
            请凭观察期在脑海中规划的路线完成【底十字 + 第1组 F2L】，停表后将自动揭晓并对比最优路线。
          </p>
        </div>
      )}
    </div>
  );
}
