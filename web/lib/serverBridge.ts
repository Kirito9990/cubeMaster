import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import path from "path";
import readline from "readline";

const BACKEND_URL = process.env.CUBEMASTER_BACKEND_URL ?? "http://127.0.0.1:8000";
const REPO_ROOT = path.resolve(process.cwd(), "..");

interface WorkerResponse {
  id?: number;
  ok: boolean;
  status: number;
  data?: unknown;
  detail?: string;
}

class PythonEngineWorker {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, (res: WorkerResponse) => void>();

  private ensureProcess() {
    if (this.proc && !this.proc.killed) return;
    const pyBin = process.env.CUBEMASTER_PYTHON ?? "/usr/bin/python3";
    this.proc = spawn(pyBin, ["-m", "backend.cli_worker"], {
      cwd: REPO_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const rl = readline.createInterface({ input: this.proc.stdout });
    rl.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as WorkerResponse;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const cb = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          cb(msg);
        }
      } catch {
        // Ignore non-JSON stdout
      }
    });

    this.proc.on("exit", () => {
      for (const [, cb] of this.pending) {
        cb({ ok: false, status: 500, detail: "Python engine worker exited unexpectedly" });
      }
      this.pending.clear();
      this.proc = null;
    });
  }

  public call(payload: Record<string, unknown>): Promise<WorkerResponse> {
    this.ensureProcess();
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.proc!.stdin.write(JSON.stringify({ ...payload, id }) + "\n");
    });
  }
}

const globalForWorker = globalThis as unknown as { __cubeMasterWorker?: PythonEngineWorker };

function getWorker(): PythonEngineWorker {
  if (!globalForWorker.__cubeMasterWorker) {
    globalForWorker.__cubeMasterWorker = new PythonEngineWorker();
  }
  return globalForWorker.__cubeMasterWorker;
}

export async function forwardOrRunPython(
  apiPath: string,
  method: "GET" | "POST",
  bodyObj: Record<string, unknown>,
  fallbackPayload: Record<string, unknown>,
): Promise<{ status: number; data: unknown }> {
  // 1. Try FastAPI backend on port 8000 first with short timeout
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    const res = await fetch(`${BACKEND_URL}${apiPath}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(bodyObj) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const json = await res.json();
    return { status: res.status, data: json };
  } catch {
    // 2. Fallback to built-in persistent Python worker (c_plus_1_engine.py)
    const workerRes = await getWorker().call(fallbackPayload);
    if (!workerRes.ok) {
      return { status: workerRes.status || 500, data: { detail: workerRes.detail || "分析出错" } };
    }
    return { status: workerRes.status || 200, data: workerRes.data };
  }
}
