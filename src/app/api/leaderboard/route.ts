import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getLeaderboard, MATCH_SELECT } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [leaderboard, { data: clashes }] = await Promise.all([
    getLeaderboard(),
    db()
      .from("matches")
      .select(MATCH_SELECT)
      .not("team1_id", "is", null)
      .not("team2_id", "is", null)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json(
    {
      leaderboard: leaderboard ?? [],
      clashes: clashes ?? [],
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}


