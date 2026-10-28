import { NextResponse } from "next/server";
import { forwardOrRunPython } from "@/lib/serverBridge";

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const { status, data } = await forwardOrRunPython("/api/coach", "POST", body, {
    action: "coach",
    ...body,
  });
  return NextResponse.json(data, { status });
}
