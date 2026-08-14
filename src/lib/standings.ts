import { db } from "@/lib/supabase";
import type { Match } from "@/lib/types";

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

/**
 * Recomputes a team's full standing from every finished or scored match it played.
 * Idempotent by design — safe to call again after an admin override.
 */
export async function recalcTeamStats(teamIds: (string | null)[]) {
  const ids = teamIds.filter(Boolean) as string[];
  for (const teamId of ids) {
    const { data: matches } = await db()
      .from("matches")
      .select("team1_id, team2_id, final_score1, final_score2, winner_id, status")
      .in("status", ["finished", "live"])
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
      if (m.status === "finished") {
        if (m.winner_id === teamId) wins++;
        else if (m.winner_id === null && (m.final_score1 != null || m.final_score2 != null)) draws++;
        else if (m.winner_id != null && m.winner_id !== teamId) losses++;
      }
    }

    // Points calculation: use total game score if present, otherwise calculate by match wins/draws
    const matchPts = wins * WIN_POINTS + draws * DRAW_POINTS;
    const points = mapsWon > 0 ? mapsWon : matchPts;

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

export async function getLeaderboard() {
  const [{ data }, settings] = await Promise.all([
    db()
      .from("teams")
      .select("id, team_name, logo_url, points, wins, losses, draws, maps_won, maps_lost, status")
      .neq("status", "rejected")
      .order("points", { ascending: false })
      .order("wins", { ascending: false }),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};
  const teamOrders: Record<string, number> = settings.team_orders ?? {};

  const rawList = (data ?? []).map((t) => {
    const category: "boys" | "girls" = teamCategories[t.id] ?? "boys";
    const customOrder: number | null = typeof teamOrders[t.id] === "number" ? teamOrders[t.id] : null;
    const played = t.wins + t.losses + t.draws;
    const win_rate = played ? Math.round((t.wins / played) * 100) : 0;
    return {
      ...t,
      category,
      custom_order: customOrder,
      played,
      win_rate,
    };
  });

  // Sort list:
  // 1. If custom_order is defined on both, sort by custom_order.
  // 2. If custom_order is defined on one, place that one ahead according to custom_order.
  // 3. Fallback: points -> maps difference -> wins.
  const sorted = [...rawList].sort((a, b) => {
    if (a.custom_order !== null && b.custom_order !== null) {
      return a.custom_order - b.custom_order;
    }
    if (a.custom_order !== null) return -1;
    if (b.custom_order !== null) return 1;
    return (
      b.points - a.points ||
      (b.maps_won - b.maps_lost) - (a.maps_won - a.maps_lost) ||
      b.wins - a.wins
    );
  });

  return sorted.map((t, i) => ({
    rank: i + 1,
    ...t,
  }));
}

export async function getLeaderboardSplits() {
  const fullLeaderboard = await getLeaderboard();

  const boysTeams = fullLeaderboard
    .filter((t) => t.category === "boys")
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  const girlsTeams = fullLeaderboard
    .filter((t) => t.category === "girls")
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  return {
    leaderboard: fullLeaderboard,
    boys_leaderboard: boysTeams,
    girls_leaderboard: girlsTeams,
  };
}

export const MATCH_SELECT =
  "*, team1:teams!matches_team1_id_fkey(id, team_name, logo_url), team2:teams!matches_team2_id_fkey(id, team_name, logo_url)";

export async function getMatchWithTeams(id: string): Promise<Match | null> {
  const { data } = await db().from("matches").select(MATCH_SELECT).eq("id", id).single();
  return data as Match | null;
}
