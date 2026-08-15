import { db } from "@/lib/supabase";
import type { Match } from "@/lib/types";

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/**
 * Recomputes a team's full standing from every finished or scored match it played.
 * Uses cumulative player score across all matches as the team points.
 * Idempotent by design — safe to call again after any score or match update.
 */
export async function recalcTeamStats(teamIds: (string | null)[]) {
  const ids = teamIds.filter(Boolean) as string[];
  for (const teamId of ids) {
    const { data: matches } = await db()
      .from("matches")
      .select("team1_id, team2_id, final_score1, final_score2, winner_id, status, submission_team1, submission_team2")
      .in("status", ["finished", "live"])
      .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`);

    let wins = 0,
      losses = 0,
      draws = 0,
      mapsWon = 0,
      mapsLost = 0,
      totalPlayerScore = 0;

    for (const m of matches ?? []) {
      const isTeam1 = m.team1_id === teamId;
      const ownScore = (isTeam1 ? m.final_score1 : m.final_score2) ?? 0;
      const oppScore = (isTeam1 ? m.final_score2 : m.final_score1) ?? 0;

      // Extract individual player score sum from match submission if available
      const sub = isTeam1 ? m.submission_team1 : m.submission_team2;
      let playerScoresSum = 0;
      if (sub && typeof sub === "object" && Array.isArray((sub as any).players)) {
        playerScoresSum = (sub as any).players.reduce((acc: number, p: any) => acc + (Number(p.score) || 0), 0);
      }

      if (playerScoresSum > 0) {
        totalPlayerScore += playerScoresSum;
      } else {
        totalPlayerScore += ownScore;
      }

      mapsWon += ownScore;
      mapsLost += oppScore;
      if (m.status === "finished") {
        if (m.winner_id === teamId) wins++;
        else if (m.winner_id === null && (m.final_score1 != null || m.final_score2 != null)) draws++;
        else if (m.winner_id != null && m.winner_id !== teamId) losses++;
      }
    }

    // Points calculation: use total cumulative player scores if present, fallback to match wins
    const matchPts = wins * WIN_POINTS + draws * DRAW_POINTS;
    const points = totalPlayerScore > 0 ? totalPlayerScore : (mapsWon > 0 ? mapsWon : matchPts);

    await db()
      .from("teams")
      .update({
        wins,
        losses,
        draws,
        maps_won: mapsWon,
        maps_lost: mapsLost,
        points,
      })
      .eq("id", teamId);
  }
}

export async function getSystemSettings(): Promise<Record<string, any>> {
  try {
    const { data } = await db()
      .from("announcements")
      .select("id, body")
      .eq("title", "__SYSTEM_SETTINGS__")
      .maybeSingle();

    if (data?.body) {
      try {
        return JSON.parse(data.body);
      } catch {
        return {};
      }
    }
  } catch {
    // fallback
  }
  return {};
}

export async function updateSystemSettings(newValues: Record<string, any>) {
  try {
    const current = await getSystemSettings();
    const merged = { ...current, ...newValues };
    const newBody = JSON.stringify(merged);

    const { data: existing } = await db()
      .from("announcements")
      .select("id")
      .eq("title", "__SYSTEM_SETTINGS__")
      .maybeSingle();

    if (existing?.id) {
      await db().from("announcements").update({ body: newBody }).eq("id", existing.id);
    } else {
      await db().from("announcements").insert({ title: "__SYSTEM_SETTINGS__", body: newBody });
    }
    return merged;
  } catch (e) {
    console.error("[updateSystemSettings error]", e);
    return null;
  }
}

/** Helper comparator that automatically sorts teams strictly based on player score/points and performance */
function compareTeamsByScore(a: any, b: any) {
  // 1. Total Points / Cumulative Player Score (descending)
  if (b.points !== a.points) return b.points - a.points;
  // 2. Maps/Score Won (descending)
  if (b.maps_won !== a.maps_won) return b.maps_won - a.maps_won;
  // 3. Wins count (descending)
  if (b.wins !== a.wins) return b.wins - a.wins;
  // 4. Map differential
  const diffA = a.maps_won - a.maps_lost;
  const diffB = b.maps_won - b.maps_lost;
  if (diffB !== diffA) return diffB - diffA;
  // 5. Alphabetical fallback
  return a.team_name.localeCompare(b.team_name);
}

export async function getLeaderboard() {
  const [{ data }, settings] = await Promise.all([
    db()
      .from("teams")
      .select("id, team_name, logo_url, points, wins, losses, draws, maps_won, maps_lost, status")
      .neq("status", "rejected"),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};

  const rawList = (data ?? []).map((t) => {
    const category: "boys" | "girls" = teamCategories[t.id] ?? "boys";
    const played = t.wins + t.losses + t.draws;
    const win_rate = played ? Math.round((t.wins / played) * 100) : 0;
    return {
      ...t,
      category,
      played,
      win_rate,
    };
  });

  const sorted = [...rawList].sort(compareTeamsByScore);

  return sorted.map((t, i) => ({
    rank: i + 1,
    ...t,
  }));
}

/**
 * Returns the overall leaderboard plus automatically ranked Boys and Girls divisions
 * separately, each ordered strictly by cumulative player score and performance.
 */
export async function getLeaderboardSplits() {
  const [{ data }, settings] = await Promise.all([
    db()
      .from("teams")
      .select("id, team_name, logo_url, points, wins, losses, draws, maps_won, maps_lost, status")
      .neq("status", "rejected"),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};

  const allTeams = (data ?? []).map((t) => {
    const category: "boys" | "girls" = teamCategories[t.id] ?? "boys";
    const played = t.wins + t.losses + t.draws;
    const win_rate = played ? Math.round((t.wins / played) * 100) : 0;
    return {
      ...t,
      category,
      played,
      win_rate,
    };
  });

  const overallLeaderboard = [...allTeams]
    .sort(compareTeamsByScore)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Automatically rank Boys division separately using player score
  const boysLeaderboard = allTeams
    .filter((t) => (t.category ?? "boys") === "boys")
    .sort(compareTeamsByScore)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Automatically rank Girls division separately using player score
  const girlsLeaderboard = allTeams
    .filter((t) => t.category === "girls")
    .sort(compareTeamsByScore)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  return {
    leaderboard: overallLeaderboard,
    boys_leaderboard: boysLeaderboard,
    girls_leaderboard: girlsLeaderboard,
  };
}

export const MATCH_SELECT =
  "*, team1:teams!matches_team1_id_fkey(id, team_name, logo_url), team2:teams!matches_team2_id_fkey(id, team_name, logo_url)";

export async function getMatchWithTeams(id: string): Promise<Match | null> {
  const { data } = await db().from("matches").select(MATCH_SELECT).eq("id", id).single();
  return data as Match | null;
}
