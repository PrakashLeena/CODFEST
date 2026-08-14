import { NextResponse } from "next/server";
import { getLeaderboard, getLeaderboardImages } from "@/lib/standings";

export const dynamic = "force-dynamic";

export async function GET() {
  const [leaderboard, images] = await Promise.all([
    getLeaderboard(),
    getLeaderboardImages(),
  ]);
  return NextResponse.json({ leaderboard, images });
}
