import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Returns the logged-in captain's own team + players (or 404 if none). */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: team } = await db()
    .from("teams")
    .select("*")
    .eq("captain_id", user.id)
    .maybeSingle();

  const { data: dbUser } = await db()
    .from("users")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();

  const captainUser = {
    name: dbUser?.name ?? user.name ?? "",
    email: dbUser?.email ?? user.email ?? "",
  };

  if (!team) return NextResponse.json({ team: null, players: [], user: captainUser });

  const { getSystemSettings } = await import("@/lib/standings");
  const settings = await getSystemSettings();
  const leaderGameIds = settings.leader_game_ids ?? {};
  (team as any).game_id = leaderGameIds[team.id] || "";

  const { data: players } = await db()
    .from("players")
    .select("*")
    .eq("team_id", team.id)
    .order("is_substitute");

  return NextResponse.json({ team, players: players ?? [], user: captainUser });
}
