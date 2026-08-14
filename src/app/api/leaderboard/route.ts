import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getLeaderboard, MATCH_SELECT } from "@/lib/standings";

export const dynamic = "force-dynamic";

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

  return NextResponse.json({
    leaderboard,
    clashes: clashes ?? [],
  });
}

