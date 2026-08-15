import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { currentUser } from "@/lib/auth";
import { MATCH_SELECT } from "@/lib/standings";

export const dynamic = "force-dynamic";

/** Captain dashboard data: own team, roster and matches. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: team } = await db()
    .from("teams").select("*, captain:users!teams_captain_id_fkey(name)").eq("captain_id", user.id).maybeSingle();
  if (!team) return NextResponse.json({ team: null, players: [], matches: [] });

  const [{ data: players }, { data: matches }] = await Promise.all([
    db().from("players").select("*").eq("team_id", team.id).order("is_substitute"),
    db()
      .from("matches")
      .select(MATCH_SELECT)
      .or(`team1_id.eq.${team.id},team2_id.eq.${team.id}`)
      .order("round"),
  ]);

  return NextResponse.json({ team, players: players ?? [], matches: matches ?? [] });
}
