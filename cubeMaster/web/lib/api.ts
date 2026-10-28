import type { AnalyzeResponse, CoachComment, ColorMode, CrossColorName } from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接后端 API (请先启动 uvicorn backend.app:app --port 8000) ");
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      if (res.status >= 500) detail = "后端 API 未启动或出错 (检查 http://127.0.0.1:8000/api/health) ";
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const analyze = (
  scramble: string,
  colorMode: ColorMode = "white",
  crossColors?: CrossColorName[],
) =>
  post<AnalyzeResponse>("/api/analyze", {
    scramble,
    color_mode: colorMode,
    cross_colors: crossColors && crossColors.length > 0 ? crossColors : undefined,
  });

export const fetchCoach = (
  scramble: string,
  colorMode: ColorMode = "white",
  crossColors?: CrossColorName[],
) =>
  post<CoachComment>("/api/coach", {
    scramble,
    color_mode: colorMode,
    cross_colors: crossColors && crossColors.length > 0 ? crossColors : undefined,
  });

export async function fetchRandomScramble(length = 20): Promise<string> {
  try {
    const res = await fetch(`/api/scramble?length=${length}`);
    if (res.ok) {
      const data = (await res.json()) as { scramble: string };
      if (data.scramble) return data.scramble;
    }
  } catch {
    // Fallback client-side WCA scramble generator if backend endpoint isn't reached
  }
  const faces = ["U", "D", "R", "L", "F", "B"];
  const opp: Record<string, string> = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };
  const suffixes = ["", "'", "2"];
  const moves: string[] = [];
  let prev = "";
  let prev2 = "";
  for (let i = 0; i < length; i++) {
    const cands = faces.filter((f) => f !== prev && !(prev === opp[f] && prev2 === f));
    const f = cands[Math.floor(Math.random() * cands.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    moves.push(f + s);
    prev2 = prev;
    prev = f;
  }
  return moves.join(" ");
}
