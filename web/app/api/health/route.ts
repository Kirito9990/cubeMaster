import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    engine: "c_plus_1_engine (6-color neutral)",
  });
}
