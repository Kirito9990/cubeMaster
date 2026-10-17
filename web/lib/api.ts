import type { AnalyzeResponse, CoachComment } from "./types";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接后端 API（请先启动 uvicorn backend.app:app --port 8000）");
  }
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      if (res.status >= 500) detail = "后端 API 未启动或出错（检查 http://127.0.0.1:8000/api/health）";
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const analyze = (scramble: string) => post<AnalyzeResponse>("/api/analyze", { scramble });

export const fetchCoach = (scramble: string) => post<CoachComment>("/api/coach", { scramble });
