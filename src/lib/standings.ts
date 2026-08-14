import { db } from "@/lib/supabase";
import type { Match } from "@/lib/types";

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/**
 * Recomputes a team's full standing from every finished match it played.
 * Idempotent by design — safe to call again after an admin override.
 */
export async function recalcTeamStats(teamIds: (string | null)[]) {
  const ids = teamIds.filter(Boolean) as string[];
  for (const teamId of ids) {
    const { data: matches } = await db()
      .from("matches")
      .select("team1_id, team2_id, final_score1, final_score2, winner_id")
      .eq("status", "finished")
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);

    let wins = 0,
      losses = 0,
      draws = 0,
      mapsWon = 0,
      mapsLost = 0;

    for (const m of matches ?? []) {
      const isTeam1 = m.team1_id === teamId;
      const own = (isTeam1 ? m.final_score1 : m.final_score2) ?? 0;
      const opp = (isTeam1 ? m.final_score2 : m.final_score1) ?? 0;
      mapsWon += own;
      mapsLost += opp;
      if (m.winner_id === teamId) wins++;
      else if (m.winner_id === null) draws++;
      else losses++;
    }

    await db()
      .from("teams")
      .update({
        wins,
        losses,
        draws,
        maps_won: mapsWon,
        maps_lost: mapsLost,
        points: wins * WIN_POINTS + draws * DRAW_POINTS,
      })
      .eq("id", teamId);
  }
}

export async function getLeaderboard() {
  const { data } = await db()
    .from("teams")
    .select("id, team_name, logo_url, points, wins, losses, draws, maps_won, maps_lost")
    .eq("status", "approved")
    .order("points", { ascending: false })
    .order("wins", { ascending: false });

  return (data ?? [])
    .sort((a, b) =>
      b.points - a.points ||
      (b.maps_won - b.maps_lost) - (a.maps_won - a.maps_lost) ||
      b.wins - a.wins
    )
    .map((t, i) => {
      const played = t.wins + t.losses + t.draws;
      return {
        rank: i + 1,
        ...t,
        played,
        win_rate: played ? Math.round((t.wins / played) * 100) : 0,
      };
    });
}

export const MATCH_SELECT =
  "*, team1:teams!matches_team1_id_fkey(id, team_name, logo_url), team2:teams!matches_team2_id_fkey(id, team_name, logo_url)";

export async function getMatchWithTeams(id: string): Promise<Match | null> {
  const { data } = await db().from("matches").select(MATCH_SELECT).eq("id", id).single();
  return data as Match | null;
}
