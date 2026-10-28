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
        hostRef.current.innerHTML = "";
        const player = new TwistyPlayer({
          puzzle: "3x3x3",
          visualization: "3D",
          alg: latest.current.alg,
          experimentalSetupAlg: latest.current.setupAlg,
          background: "none",
          controlPanel: "bottom-row",
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
        <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
          正在加载 3D 魔方演示...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-rose-400">
          魔方渲染失败: {error}
        </div>
      )}
      <div ref={hostRef} className="h-full w-full" />
    </div>
  );
}
