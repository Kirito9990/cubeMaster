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
    throw new Error("无法连接分析服务，请刷新页面重试");
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      detail = "求解服务出错，请检查输入的打乱公式";
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const analyze = (
  scramble: string,
  colorMode: ColorMode = "full",
  crossColors?: CrossColorName[],
) =>
  post<AnalyzeResponse>("/api/analyze", {
    scramble,
    color_mode: colorMode,
    cross_colors: crossColors && crossColors.length > 0 ? crossColors : undefined,
  });

export const fetchCoach = (
  scramble: string,
  colorMode: ColorMode = "full",
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
    // Fallback client-side WCA scramble generator
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
