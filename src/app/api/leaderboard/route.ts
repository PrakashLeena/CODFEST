import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { getLeaderboardSplits, getSystemSettings, MATCH_SELECT } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const [splits, { data: clashes }, settings] = await Promise.all([
    getLeaderboardSplits(),
    db()
      .from("matches")
      .select(MATCH_SELECT)
      .not("team1_id", "is", null)
      .not("team2_id", "is", null)
      .order("created_at", { ascending: false }),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};

  // Enrich clash matches with team categories
  const enrichedClashes = (clashes ?? []).map((c: any) => ({
    ...c,
    team1_category: c.team1_id ? teamCategories[c.team1_id] ?? "boys" : "boys",
    team2_category: c.team2_id ? teamCategories[c.team2_id] ?? "boys" : "boys",
  }));

  return NextResponse.json(
    {
      leaderboard: splits.leaderboard,
      boys_leaderboard: splits.boys_leaderboard,
      girls_leaderboard: splits.girls_leaderboard,
      boys_top_killers: splits.boys_top_killers,
      girls_top_killers: splits.girls_top_killers,
      all_top_killers: splits.all_top_killers,
      top_killer_boys: splits.top_killer_boys,
      top_killer_girls: splits.top_killer_girls,
      top_killer_overall: splits.top_killer_overall,
      clashes: enrichedClashes,
      team_categories: teamCategories,
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


