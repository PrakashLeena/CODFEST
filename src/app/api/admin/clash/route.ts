import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { MATCH_SELECT, recalcTeamStats, getLeaderboard } from "@/lib/standings";
import { emitEvent } from "@/lib/socket";

export const dynamic = "force-dynamic";

const playerStatSchema = z.object({
  name: z.string().min(1),
  score: z.coerce.number().default(0),
  kills: z.coerce.number().default(0),
  assists: z.coerce.number().default(0),
  deaths: z.coerce.number().default(0),
  ping: z.coerce.number().default(0),
});

const clashSchema = z.object({
  match_id: z.string().uuid().optional().nullable(),
  team1_id: z.string().uuid(),
  team2_id: z.string().uuid(),
  map: z.string().default("Crash"),
  round: z.coerce.number().int().min(1).default(1),
  team1_players: z.array(playerStatSchema),
  team2_players: z.array(playerStatSchema),
  status: z.enum(["finished", "live", "scheduled"]).default("finished"),
  note: z.string().optional().nullable(),
});

/**
 * GET /api/admin/clash
 * Returns approved teams (with rosters and logos) and matches with clash scorecards.
 */
export async function GET() {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const [{ data: teams }, { data: matches }] = await Promise.all([
    db()
      .from("teams")
      .select("id, team_name, logo_url, status, points, wins, losses, draws, maps_won, maps_lost, players(id, player_name, game_id)")
      .eq("status", "approved")
      .order("team_name", { ascending: true }),
    db()
      .from("matches")
      .select(MATCH_SELECT)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    teams: teams ?? [],
    matches: matches ?? [],
  });
}

/**
 * POST /api/admin/clash
 * Saves or updates a clash score with full player statistics.
 * Automatically calculates total team score and winning team.
 */
export async function POST(req: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = clashSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { match_id, team1_id, team2_id, map, round, team1_players, team2_players, status, note } = parsed.data;

  if (team1_id === team2_id) {
    return NextResponse.json({ error: "A team cannot play itself" }, { status: 400 });
  }

  // Automatic calculation of team scores from player scores
  const totalScore1 = team1_players.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
  const totalScore2 = team2_players.reduce((sum, p) => sum + (Number(p.score) || 0), 0);

  // Automatic determination of the winning team
  let winnerId: string | null = null;
  if (totalScore1 > totalScore2) {
    winnerId = team1_id;
  } else if (totalScore2 > totalScore1) {
    winnerId = team2_id;
  } else {
    // If scores are equal, tiebreaker by kills
    const kills1 = team1_players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
    const kills2 = team2_players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
    if (kills1 > kills2) winnerId = team1_id;
    else if (kills2 > kills1) winnerId = team2_id;
    else winnerId = null; // draw
  }

  const submission1 = {
    score_own: totalScore1,
    score_opponent: totalScore2,
    players: team1_players,
    submitted_at: new Date().toISOString(),
    submitted_by: admin.id,
  };

  const submission2 = {
    score_own: totalScore2,
    score_opponent: totalScore1,
    players: team2_players,
    submitted_at: new Date().toISOString(),
    submitted_by: admin.id,
  };

function isValidUuid(val?: string | null): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

  const validAdminUuid = isValidUuid(admin.id) ? admin.id : null;
  let targetMatchId = isValidUuid(match_id) ? match_id : null;

  if (targetMatchId) {
    // Update existing match
    const { error: updateErr } = await db()
      .from("matches")
      .update({
        team1_id,
        team2_id,
        map,
        round,
        status,
        final_score1: totalScore1,
        final_score2: totalScore2,
        winner_id: winnerId,
        submission_team1: submission1,
        submission_team2: submission2,
        resolved_by: validAdminUuid,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", targetMatchId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
  } else {
    // Insert new match
    const { data: newMatch, error: insertErr } = await db()
      .from("matches")
      .insert({
        team1_id,
        team2_id,
        map,
        round,
        status,
        final_score1: totalScore1,
        final_score2: totalScore2,
        winner_id: winnerId,
        submission_team1: submission1,
        submission_team2: submission2,
        resolved_by: validAdminUuid,
        resolved_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }
    targetMatchId = newMatch.id;
  }

  // Recalculate standings for both teams
  await recalcTeamStats([team1_id, team2_id]);

  // Fetch updated match with team details
  const { data: updatedMatch } = await db()
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", targetMatchId)
    .single();

  const leaderboard = await getLeaderboard();

  // Broadcast realtime socket events
  emitEvent("match:finished", {
    matchId: targetMatchId,
    finalScore: [totalScore1, totalScore2],
    winnerId,
  });
  emitEvent("leaderboard:updated", { leaderboard });

  await logAudit(admin.id, "match.clash_updated", targetMatchId ?? null, {
    team1_id,
    team2_id,
    score1: totalScore1,
    score2: totalScore2,
    winner_id: winnerId,
    note: note ?? null,
  });

  return NextResponse.json({
    ok: true,
    match: updatedMatch,
    winnerId,
    totalScore1,
    totalScore2,
    leaderboard,
  });
}

/**
 * DELETE /api/admin/clash
 * Deletes a clash match by ID and recalculates affected team standings.
 */
export async function DELETE(req: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { match_id } = body ?? {};

  if (!match_id || typeof match_id !== "string") {
    return NextResponse.json({ error: "match_id required" }, { status: 400 });
  }

  // Fetch match before deleting to get team IDs for standings recalc
  const { data: match, error: fetchErr } = await db()
    .from("matches")
    .select("id, team1_id, team2_id")
    .eq("id", match_id)
    .single();

  if (fetchErr || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  const { error: deleteErr } = await db().from("matches").delete().eq("id", match_id);
  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 });
  }

  // Recalculate standings for both teams
  await recalcTeamStats([match.team1_id, match.team2_id]);

  const leaderboard = await getLeaderboard();
  emitEvent("leaderboard:updated", { leaderboard });

  await logAudit(admin.id, "match.clash_deleted", match_id, {
    team1_id: match.team1_id,
    team2_id: match.team2_id,
  });

  return NextResponse.json({ ok: true, leaderboard });
}

/**
 * PATCH /api/admin/clash
 * Direct update of team standings stats (points, wins, losses, etc.)
 */
export async function PATCH(req: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const { team_id, points, wins, losses, draws, maps_won, maps_lost } = body ?? {};

  if (!team_id) {
    return NextResponse.json({ error: "team_id required" }, { status: 400 });
  }

  const updates: Record<string, number> = {};
  if (typeof points === "number") updates.points = points;
  if (typeof wins === "number") updates.wins = wins;
  if (typeof losses === "number") updates.losses = losses;
  if (typeof draws === "number") updates.draws = draws;
  if (typeof maps_won === "number") updates.maps_won = maps_won;
  if (typeof maps_lost === "number") updates.maps_lost = maps_lost;

  const { error } = await db().from("teams").update(updates).eq("id", team_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leaderboard = await getLeaderboard();
  emitEvent("leaderboard:updated", { leaderboard });

  await logAudit(admin.id, "team.stats_manual_override", team_id, updates);

  return NextResponse.json({ ok: true, leaderboard });
}
