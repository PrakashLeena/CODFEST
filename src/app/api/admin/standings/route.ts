import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { recalcTeamStats } from "@/lib/standings";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** PATCH — admin updates team standings stats (points, wins, losses, draws, maps_won, maps_lost) */
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { team_id, points, wins, losses, draws, maps_won, maps_lost } = body;

  if (!team_id) {
    return NextResponse.json({ error: "Missing team_id" }, { status: 400 });
  }

  const updates: Record<string, number> = {};
  if (points !== undefined) updates.points = Number(points);
  if (wins !== undefined) updates.wins = Number(wins);
  if (losses !== undefined) updates.losses = Number(losses);
  if (draws !== undefined) updates.draws = Number(draws);
  if (maps_won !== undefined) updates.maps_won = Number(maps_won);
  if (maps_lost !== undefined) updates.maps_lost = Number(maps_lost);

  const { data, error } = await db()
    .from("teams")
    .update(updates)
    .eq("id", team_id)
    .select("id, team_name, points, wins, losses, draws, maps_won, maps_lost")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (session.user?.id) {
    await logAudit(session.user.id, "standings.manual_override", team_id, updates);
  }

  return NextResponse.json({ team: data });
}

/** POST — recalculate team stats from finished matches */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const teamId = body.team_id;

  if (teamId) {
    await recalcTeamStats([teamId]);
  } else {
    const { data: teams } = await db().from("teams").select("id").eq("status", "approved");
    const ids = (teams ?? []).map((t) => t.id);
    await recalcTeamStats(ids);
  }

  return NextResponse.json({ ok: true });
}
