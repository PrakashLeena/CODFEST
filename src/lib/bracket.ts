import { db } from "@/lib/supabase";
import { emitEvent } from "@/lib/socket";
import { recalcTeamStats, getLeaderboard, MATCH_SELECT } from "@/lib/standings";
import { MAP_POOL, type Match } from "@/lib/types";

export async function getBracket() {
  const { data } = await db()
    .from("matches")
    .select(MATCH_SELECT)
    .order("round", { ascending: true })
    .order("bracket_slot", { ascending: true });
  return (data ?? []) as Match[];
}

/**
 * Seeds a single-elimination bracket from all approved teams.
 * Pads to the next power of two — teams drawn against a bye slot
 * sit in a match with an empty opponent until the admin resolves it
 * or regenerates. Wipes any existing fixtures.
 */
export async function generateBracket() {
  const { data: teams } = await db()
    .from("teams")
    .select("id")
    .eq("status", "approved");

  const ids = (teams ?? []).map((t) => t.id);
  if (ids.length < 2) throw new Error("Need at least 2 approved teams");

  // Fisher-Yates shuffle for a random seed order.
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }

  let size = 2;
  while (size < ids.length) size *= 2;
  const slots: (string | null)[] = [...ids, ...Array(size - ids.length).fill(null)];

  await db().from("matches").delete().neq("id", "00000000-0000-0000-0000-000000000000");

  const rows = [];
  for (let slot = 0; slot < size / 2; slot++) {
    rows.push({
      round: 1,
      bracket_slot: slot,
      team1_id: slots[slot * 2],
      team2_id: slots[slot * 2 + 1],
      map: MAP_POOL[slot % MAP_POOL.length],
      status: "scheduled",
    });
  }
  const { error } = await db().from("matches").insert(rows);
  if (error) throw new Error(error.message);

  const bracket = await getBracket();
  emitEvent("bracket:updated", { bracket });
  return bracket;
}

/** Moves the winner of a finished match into its slot in the next round. */
async function advanceWinner(match: Match) {
  if (!match.winner_id) return;

  const { count } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("round", match.round);
  if ((count ?? 0) <= 1) return; // that was the final

  const nextRound = match.round + 1;
  const nextSlot = Math.floor(match.bracket_slot / 2);
  const teamField = match.bracket_slot % 2 === 0 ? "team1_id" : "team2_id";

  const { data: existing } = await db()
    .from("matches")
    .select("id")
    .eq("round", nextRound)
    .eq("bracket_slot", nextSlot)
    .maybeSingle();

  if (existing) {
    await db().from("matches").update({ [teamField]: match.winner_id }).eq("id", existing.id);
  } else {
    await db().from("matches").insert({
      round: nextRound,
      bracket_slot: nextSlot,
      [teamField]: match.winner_id,
      map: MAP_POOL[nextSlot % MAP_POOL.length],
      status: "scheduled",
    });
  }
}

/**
 * Single path for completing a match — used by both dual-submission
 * auto-confirmation and admin dispute resolution. Sets final score,
 * updates standings, advances the bracket and pushes realtime events.
 */
export async function finalizeMatch(
  match: Match,
  score1: number,
  score2: number,
  resolvedBy?: string
) {
  const winnerId =
    score1 > score2 ? match.team1_id : score2 > score1 ? match.team2_id : null;

  const validResolvedBy =
    resolvedBy && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedBy)
      ? resolvedBy
      : null;

  await db()
    .from("matches")
    .update({
      status: "finished",
      final_score1: score1,
      final_score2: score2,
      winner_id: winnerId,
      resolved_by: validResolvedBy,
      resolved_at: resolvedBy ? new Date().toISOString() : null,
    })
    .eq("id", match.id);

  await recalcTeamStats([match.team1_id, match.team2_id]);

  const finished = { ...match, winner_id: winnerId };
  await advanceWinner(finished as Match);

  emitEvent("match:finished", {
    matchId: match.id,
    finalScore: [score1, score2],
    winnerId,
  });
  emitEvent("leaderboard:updated", { leaderboard: await getLeaderboard() });
  emitEvent("bracket:updated", { bracket: await getBracket() });

  return winnerId;
}
