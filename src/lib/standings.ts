import { db } from "@/lib/supabase";
import type { Match } from "@/lib/types";

const WIN_POINTS = 3;
const DRAW_POINTS = 1;

export interface PlayerKillStat {
  rank: number;
  name: string;
  team_id: string;
  team_name: string;
  team_logo?: string | null;
  category: "boys" | "girls";
  total_kills: number;
  total_deaths: number;
  total_assists: number;
  total_score: number;
  matches_played: number;
  kd_ratio: number;
  avg_kills: number;
  max_kills_single_match: number;
}

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

/**
 * Helper comparator that strictly assigns team position in Boys and Girls divisions
 * based ONLY on match WINS and LOSSES (not points).
 * 1. Custom display order (if manually set by admin)
 * 2. Wins (descending - higher wins is better)
 * 3. Losses (ascending - fewer losses is better)
 * 4. Win Rate % (descending)
 * 5. Map differential (descending)
 * 6. Maps Won (descending)
 * 7. Alphabetical fallback
 */
export function compareTeamsByRecord(a: any, b: any) {
  // Custom manual order set by admin takes precedence if configured
  const ordA = a.display_order ?? null;
  const ordB = b.display_order ?? null;
  if (ordA !== null && ordB !== null) return ordA - ordB;
  if (ordA !== null) return -1;
  if (ordB !== null) return 1;

  // 1. Wins (descending - most wins first)
  const winsA = Number(a.wins) || 0;
  const winsB = Number(b.wins) || 0;
  if (winsB !== winsA) return winsB - winsA;

  // 2. Losses (ascending - fewest losses is ranked higher)
  const lossesA = Number(a.losses) || 0;
  const lossesB = Number(b.losses) || 0;
  if (lossesA !== lossesB) return lossesA - lossesB;

  // 3. Win rate (descending)
  const winRateA = Number(a.win_rate) || 0;
  const winRateB = Number(b.win_rate) || 0;
  if (winRateB !== winRateA) return winRateB - winRateA;

  // 4. Map differential (descending)
  const diffA = (Number(a.maps_won) || 0) - (Number(a.maps_lost) || 0);
  const diffB = (Number(b.maps_won) || 0) - (Number(b.maps_lost) || 0);
  if (diffB !== diffA) return diffB - diffA;

  // 5. Maps won (descending)
  const mapsWonA = Number(a.maps_won) || 0;
  const mapsWonB = Number(b.maps_won) || 0;
  if (mapsWonB !== mapsWonA) return mapsWonB - mapsWonA;

  // 6. Alphabetical fallback
  return (a.team_name || "").localeCompare(b.team_name || "");
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
 * Aggregates all player statistics across all played matches
 * and computes top killer leaderboards for Boys and Girls divisions separately.
 */
export async function getTopKillers() {
  const [{ data: matches }, { data: teams }, settings] = await Promise.all([
    db()
      .from("matches")
      .select("id, team1_id, team2_id, status, submission_team1, submission_team2, team1:teams!matches_team1_id_fkey(id, team_name, logo_url), team2:teams!matches_team2_id_fkey(id, team_name, logo_url)")
      .in("status", ["finished", "live"]),
    db().from("teams").select("id, team_name, logo_url"),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};
  const teamMap: Record<string, { id: string; team_name: string; logo_url?: string | null }> = {};
  for (const t of teams ?? []) {
    teamMap[t.id] = t;
  }

  const playerMap: Record<
    string,
    {
      name: string;
      team_id: string;
      team_name: string;
      team_logo?: string | null;
      category: "boys" | "girls";
      total_kills: number;
      total_deaths: number;
      total_assists: number;
      total_score: number;
      matches_played: number;
      max_kills: number;
    }
  > = {};

  for (const m of matches ?? []) {
    const processTeamSubmission = (teamId: string | null, sub: any, teamObj: any) => {
      if (!teamId || !sub || typeof sub !== "object" || !Array.isArray((sub as any).players)) return;
      const effectiveTeam = teamObj || teamMap[teamId] || { id: teamId, team_name: "Unknown Team" };
      const category: "boys" | "girls" = teamCategories[teamId] ?? "boys";

      for (const p of (sub as any).players) {
        const rawName = String(p.name || "").trim();
        if (!rawName) continue;
        if (
          (rawName.toLowerCase().startsWith("member ") || rawName.toLowerCase().startsWith("player ")) &&
          (Number(p.kills) || 0) === 0 &&
          (Number(p.score) || 0) === 0
        ) {
          continue;
        }

        const playerKey = `${rawName.toLowerCase()}__${teamId}`;
        const kills = Math.max(0, Number(p.kills) || 0);
        const deaths = Math.max(0, Number(p.deaths) || 0);
        const assists = Math.max(0, Number(p.assists) || 0);
        const score = Math.max(0, Number(p.score) || 0);

        if (!playerMap[playerKey]) {
          playerMap[playerKey] = {
            name: rawName,
            team_id: teamId,
            team_name: effectiveTeam.team_name,
            team_logo: effectiveTeam.logo_url,
            category,
            total_kills: 0,
            total_deaths: 0,
            total_assists: 0,
            total_score: 0,
            matches_played: 0,
            max_kills: 0,
          };
        }

        const entry = playerMap[playerKey];
        entry.total_kills += kills;
        entry.total_deaths += deaths;
        entry.total_assists += assists;
        entry.total_score += score;
        entry.matches_played += 1;
        if (kills > entry.max_kills) {
          entry.max_kills = kills;
        }
      }
    };

    processTeamSubmission(m.team1_id, m.submission_team1, m.team1);
    processTeamSubmission(m.team2_id, m.submission_team2, m.team2);
  }

  const allPlayers = Object.values(playerMap).map((p) => {
    const kd_ratio = p.total_deaths > 0 ? Number((p.total_kills / p.total_deaths).toFixed(2)) : p.total_kills;
    const avg_kills = p.matches_played > 0 ? Number((p.total_kills / p.matches_played).toFixed(1)) : p.total_kills;
    return {
      name: p.name,
      team_id: p.team_id,
      team_name: p.team_name,
      team_logo: p.team_logo,
      category: p.category,
      total_kills: p.total_kills,
      total_deaths: p.total_deaths,
      total_assists: p.total_assists,
      total_score: p.total_score,
      matches_played: p.matches_played,
      kd_ratio,
      avg_kills,
      max_kills_single_match: p.max_kills,
    };
  });

  const sortKillers = (a: any, b: any) => {
    if (b.total_kills !== a.total_kills) return b.total_kills - a.total_kills;
    if (b.kd_ratio !== a.kd_ratio) return b.kd_ratio - a.kd_ratio;
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return a.name.localeCompare(b.name);
  };

  const rankedAll = [...allPlayers].sort(sortKillers).map((p, i) => ({ rank: i + 1, ...p }));
  const boysKillers = allPlayers
    .filter((p) => (p.category ?? "boys") === "boys")
    .sort(sortKillers)
    .map((p, i) => ({ rank: i + 1, ...p }));
  const girlsKillers = allPlayers
    .filter((p) => p.category === "girls")
    .sort(sortKillers)
    .map((p, i) => ({ rank: i + 1, ...p }));

  return {
    all_top_killers: rankedAll,
    boys_top_killers: boysKillers,
    girls_top_killers: girlsKillers,
    top_killer_boys: boysKillers.length > 0 && boysKillers[0].total_kills > 0 ? boysKillers[0] : null,
    top_killer_girls: girlsKillers.length > 0 && girlsKillers[0].total_kills > 0 ? girlsKillers[0] : null,
    top_killer_overall: rankedAll.length > 0 && rankedAll[0].total_kills > 0 ? rankedAll[0] : null,
  };
}

/**
 * Returns the overall leaderboard plus automatically ranked Boys and Girls divisions
 * separately, each ordered strictly by match WINS and LOSSES (not points),
 * along with the most lethal killer statistics for both divisions.
 */
export async function getLeaderboardSplits() {
  const [[{ data }, settings], killersData] = await Promise.all([
    Promise.all([
      db()
        .from("teams")
        .select("id, team_name, logo_url, points, wins, losses, draws, maps_won, maps_lost, status")
        .neq("status", "rejected"),
      getSystemSettings(),
    ]),
    getTopKillers(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};
  const boysTeamOrders: Record<string, number> = settings.boys_team_orders ?? {};
  const girlsTeamOrders: Record<string, number> = settings.girls_team_orders ?? {};
  const teamOrders: Record<string, number> = settings.team_orders ?? {};

  const allTeams = (data ?? []).map((t) => {
    const category: "boys" | "girls" = teamCategories[t.id] ?? "boys";
    const played = (t.wins || 0) + (t.losses || 0) + (t.draws || 0);
    const win_rate = played ? Math.round(((t.wins || 0) / played) * 100) : 0;
    const boysOrder = typeof boysTeamOrders[t.id] === "number" ? boysTeamOrders[t.id] : null;
    const girlsOrder = typeof girlsTeamOrders[t.id] === "number" ? girlsTeamOrders[t.id] : null;
    const generalOrder = typeof teamOrders[t.id] === "number" ? teamOrders[t.id] : null;

    return {
      ...t,
      category,
      played,
      win_rate,
      boys_order: boysOrder,
      girls_order: girlsOrder,
      display_order: category === "girls" ? (girlsOrder ?? generalOrder) : (boysOrder ?? generalOrder),
    };
  });

  const overallLeaderboard = [...allTeams]
    .sort(compareTeamsByScore)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Automatically rank Boys division strictly by WINS and LOSSES (not points)
  const boysLeaderboard = allTeams
    .filter((t) => (t.category ?? "boys") === "boys")
    .map((t) => ({ ...t, display_order: t.boys_order }))
    .sort(compareTeamsByRecord)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  // Automatically rank Girls division strictly by WINS and LOSSES (not points)
  const girlsLeaderboard = allTeams
    .filter((t) => t.category === "girls")
    .map((t) => ({ ...t, display_order: t.girls_order }))
    .sort(compareTeamsByRecord)
    .map((t, idx) => ({ ...t, rank: idx + 1 }));

  return {
    leaderboard: overallLeaderboard,
    boys_leaderboard: boysLeaderboard,
    girls_leaderboard: girlsLeaderboard,
    ...killersData,
  };
}

export const MATCH_SELECT =
  "*, team1:teams!matches_team1_id_fkey(id, team_name, logo_url), team2:teams!matches_team2_id_fkey(id, team_name, logo_url)";

export async function getMatchWithTeams(id: string): Promise<Match | null> {
  const { data } = await db().from("matches").select(MATCH_SELECT).eq("id", id).single();
  return data as Match | null;
}
