import { NextResponse } from "next/server";
import { forwardOrRunPython } from "@/lib/serverBridge";

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const { status, data } = await forwardOrRunPython("/api/analyze", "POST", body, {
    action: "analyze",
    ...body,
  });
  return NextResponse.json(data, { status });
}
