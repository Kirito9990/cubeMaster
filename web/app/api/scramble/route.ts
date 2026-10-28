import { NextResponse } from "next/server";
import { forwardOrRunPython } from "@/lib/serverBridge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const length = Number(searchParams.get("length") ?? "20");
  const { status, data } = await forwardOrRunPython(
    `/api/scramble?length=${length}`,
    "GET",
    {},
    { action: "scramble", length },
  );
  return NextResponse.json(data, { status });
}
