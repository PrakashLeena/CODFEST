"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TeamMark from "@/components/TeamMark";
import StatusBadge from "@/components/StatusBadge";
import { useSocketEvents } from "@/hooks/useSocket";
import { ROUND_NAMES, type Match } from "@/lib/types";

interface LeaderboardRow {
  rank: number;
  id: string;
  team_name: string;
  logo_url: string | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  win_rate: number;
  played: number;
}

interface PlayerStatRow {
  name: string;
  score: number;
  kills: number;
  assists: number;
  deaths: number;
  ping: number;
}

const slideVariants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? 250 : -250,
    opacity: 0,
    scale: 0.97,
  }),
  center: {
    x: 0,
    opacity: 1,
    scale: 1,
    transition: {
      x: { type: "spring", stiffness: 320, damping: 30 },
      opacity: { duration: 0.25 },
    },
  },
  exit: (dir: number) => ({
    x: dir >= 0 ? -250 : 250,
    opacity: 0,
    scale: 0.97,
    transition: {
      x: { type: "spring", stiffness: 320, damping: 30 },
      opacity: { duration: 0.2 },
    },
  }),
};

const FIVE_MINUTES_MS = 5 * 60 * 1000; // 5 minutes auto-refresh

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [clashes, setClashes] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Slide carousel state
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [autoSlide, setAutoSlide] = useState(true);

  const load = useCallback(async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      const res = await fetch(`/api/leaderboard?t=${Date.now()}`, {
        cache: "no-store",
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      const json = await res.json();
      if (json.leaderboard) setRows(json.leaderboard);
      if (json.clashes) setClashes(json.clashes);
      setLastUpdated(new Date());
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Auto-refresh leaderboard every 5 minutes
    const interval = setInterval(() => load(), FIVE_MINUTES_MS);
    return () => clearInterval(interval);
  }, [load]);

  useSocketEvents(
    ["leaderboard:updated", "match:finished", "match:live_score", "match:clash_updated", "bracket:updated"],
    () => {
      load();
    }
  );

  const nextSlide = useCallback(() => {
    if (clashes.length <= 1) return;
    setSlideDirection(1);
    setSlideIndex((prev) => (prev + 1) % clashes.length);
  }, [clashes.length]);

  const prevSlide = useCallback(() => {
    if (clashes.length <= 1) return;
    setSlideDirection(-1);
    setSlideIndex((prev) => (prev - 1 + clashes.length) % clashes.length);
  }, [clashes.length]);

  useEffect(() => {
    if (!autoSlide || clashes.length <= 1) return;
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [autoSlide, clashes.length, nextSlide]);

  // Check if any match or score has been recorded yet
  const hasAnyScores =
    rows.some((r) => r.points > 0 || r.played > 0 || r.wins > 0 || r.maps_won > 0 || r.losses > 0 || r.draws > 0) ||
    clashes.some(
      (c) =>
        (c.final_score1 != null && c.final_score1 > 0) ||
        (c.final_score2 != null && c.final_score2 > 0) ||
        c.status === "finished"
    );

  return (
    <div className="site-gutter mx-auto max-w-7xl py-6 sm:py-10 space-y-8 sm:space-y-12 px-3 sm:px-6">
      {/* HEADER TITLE & 5-MIN SYNC BADGE */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-night-700 pb-5 sm:pb-6">
        <div>
          <h1 className="section-title text-2xl sm:text-3xl lg:text-4xl">Tournament Leaderboard</h1>
          <p className="mt-1 font-mono text-[11px] sm:text-xs uppercase tracking-[0.1em] text-zinc-400">
            Official Standings // Match Clashes // Real-Time Scorecards
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-lg border border-night-700 bg-night-800/90 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:border-ember-500/40 hover:text-white transition-all disabled:opacity-50 active:scale-95"
            title="Refresh now or wait for 5-minute auto-refresh"
          >
            <span className={`text-ember-400 ${refreshing ? "animate-spin" : ""}`}>↻</span>
            <span className="text-xs">{refreshing ? "Refreshing…" : "Refresh"}</span>
          </button>
          <div className="flex items-center gap-2 rounded-full border border-ember-500/30 bg-ember-600/10 px-3 py-1.5 font-mono text-xs text-ember-400">
            <span className="h-2 w-2 rounded-full bg-ember-400 animate-pulse flex-shrink-0" />
            <span className="whitespace-nowrap text-[11px] sm:text-xs">AUTO-SYNC (5 MIN)</span>
            {lastUpdated && (
              <span className="hidden sm:inline text-[10px] text-zinc-400 border-l border-ember-500/30 pl-2">
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* SECTION 1: ANIMATED MATCH CLASH SHOWCASE CAROUSEL */}
      {clashes.length > 0 && (
        <div className="rounded-2xl sm:rounded-3xl border border-night-700/80 bg-gradient-to-b from-night-850 to-night-900 p-4 sm:p-6 lg:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-night-750 pb-4 mb-4 sm:mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-ember-500 animate-ping flex-shrink-0" />
                <h2 className="font-display text-lg sm:text-xl font-bold uppercase tracking-wider text-white">
                  Featured Match Clashes
                </h2>
              </div>
              <p className="mt-0.5 font-mono text-[11px] sm:text-xs text-zinc-400">
                Team vs Team clash scorecards with live right-slide transitions
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3">
              <button
                onClick={() => setAutoSlide(!autoSlide)}
                className={`rounded-lg border px-2.5 sm:px-3 py-1.5 font-mono text-[11px] sm:text-xs font-bold transition-all ${
                  autoSlide
                    ? "border-green-500/50 bg-green-500/10 text-green-400"
                    : "border-night-700 bg-night-800 text-zinc-400 hover:text-white"
                }`}
              >
                {autoSlide ? "▶ Auto-slide ON" : "⏸ Auto-slide OFF"}
              </button>

              <div className="flex items-center gap-1 bg-night-800 p-1 rounded-lg border border-night-700">
                <button
                  onClick={prevSlide}
                  className="rounded px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Previous clash slide"
                >
                  ◀
                </button>
                <span className="font-mono text-xs font-bold text-ember-400 px-1.5 sm:px-2 whitespace-nowrap">
                  {slideIndex + 1} / {clashes.length}
                </span>
                <button
                  onClick={nextSlide}
                  className="rounded px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Next clash slide"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE CONTENT */}
          <div className="relative overflow-hidden min-h-[380px] sm:min-h-[440px]">
            <AnimatePresence initial={false} custom={slideDirection} mode="wait">
              {(() => {
                const current = clashes[slideIndex] ?? clashes[0];
                if (!current) return null;

                const sub1 = current.submission_team1 as any;
                const sub2 = current.submission_team2 as any;
                const pList1: PlayerStatRow[] = sub1?.players ?? [];
                const pList2: PlayerStatRow[] = sub2?.players ?? [];

                const score1 = current.final_score1 ?? sub1?.score_own ?? 0;
                const score2 = current.final_score2 ?? sub2?.score_own ?? 0;
                const isWinner1 = current.winner_id === current.team1?.id || (score1 > score2 && score1 > 0);
                const isWinner2 = current.winner_id === current.team2?.id || (score2 > score1 && score2 > 0);

                return (
                  <motion.div
                    key={current.id}
                    custom={slideDirection}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="w-full space-y-4 sm:space-y-6"
                  >
                    {/* TEAM A vs TEAM B CLASH BANNER */}
                    <div className="relative overflow-hidden rounded-xl sm:rounded-2xl border border-night-700 bg-gradient-to-r from-blue-950/40 via-night-850 to-red-950/40 p-4 sm:p-6 shadow-2xl">
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
                        {/* TEAM A */}
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div
                            className={`relative rounded-xl sm:rounded-2xl border-2 p-1 sm:p-1.5 flex-shrink-0 transition-all ${
                              isWinner1
                                ? "border-amber-400 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                                : "border-night-700 bg-night-800"
                            }`}
                          >
                            <TeamMark
                              name={current.team1?.team_name ?? "Team A"}
                              logoUrl={current.team1?.logo_url}
                              size={52}
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-blue-400">
                                TEAM A
                              </span>
                              {isWinner1 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 sm:px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-amber-400 border border-amber-500/40 animate-pulse">
                                  🏆 VICTORY
                                </span>
                              )}
                            </div>
                            <h3 className="mt-1 font-display text-lg sm:text-2xl font-black uppercase text-white truncate">
                              {current.team1?.team_name ?? "Team A"}
                            </h3>
                            <div className="mt-0.5 font-mono text-2xl sm:text-3xl font-black text-blue-400">
                              {score1} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                        </div>

                        {/* VS BADGE & MAP INFO */}
                        <div className="text-center py-2 md:py-0 px-2 sm:px-4 border-y md:border-y-0 md:border-x border-night-750 flex md:flex-col items-center justify-between md:justify-center gap-2">
                          <div className="inline-flex items-center justify-center rounded-full border border-ember-500/50 bg-gradient-to-r from-ember-600/30 to-orange-600/30 px-3.5 sm:px-5 py-1 sm:py-1.5 font-display text-sm sm:text-xl font-black tracking-widest text-ember-400 shadow-[0_0_20px_rgba(249,115,22,0.5)]">
                            VS
                          </div>
                          <div className="flex md:flex-col items-center gap-2 md:gap-0.5 font-mono text-[10px] sm:text-xs font-bold uppercase tracking-widest text-zinc-300">
                            <span>MAP: <strong className="text-ember-400">{current.map || "Crash"}</strong></span>
                            <span className="text-zinc-500 hidden md:inline font-normal text-[11px]">
                              {ROUND_NAMES[current.round] ?? `Round ${current.round}`}
                            </span>
                          </div>
                          <StatusBadge status={current.status} />
                        </div>

                        {/* TEAM B */}
                        <div className="flex items-center justify-end gap-3 sm:gap-4 min-w-0 text-right">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
                              {isWinner2 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 sm:px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-amber-400 border border-amber-500/40 animate-pulse">
                                  🏆 VICTORY
                                </span>
                              )}
                              <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-red-400">
                                TEAM B
                              </span>
                            </div>
                            <h3 className="mt-1 font-display text-lg sm:text-2xl font-black uppercase text-white truncate">
                              {current.team2?.team_name ?? "Team B"}
                            </h3>
                            <div className="mt-0.5 font-mono text-2xl sm:text-3xl font-black text-red-400">
                              {score2} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                          <div
                            className={`relative rounded-xl sm:rounded-2xl border-2 p-1 sm:p-1.5 flex-shrink-0 transition-all ${
                              isWinner2
                                ? "border-amber-400 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                                : "border-night-700 bg-night-800"
                            }`}
                          >
                            <TeamMark
                              name={current.team2?.team_name ?? "Team B"}
                              logoUrl={current.team2?.logo_url}
                              size={52}
                            />
                          </div>
                        </div>
                      </div>

                      {/* WINNER BANNER & SLIDE INDICATORS */}
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-night-800 pt-3">
                        <div className="font-mono text-xs text-zinc-400 flex items-center gap-2">
                          <span>Outcome:</span>
                          <span className="font-bold text-amber-400">
                            {isWinner1
                              ? `${current.team1?.team_name} Won (+${score1 - score2} pts)`
                              : isWinner2
                              ? `${current.team2?.team_name} Won (+${score2 - score1} pts)`
                              : "Match Tied"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {clashes.map((_, i) => (
                            <button
                              key={i}
                              onClick={() => {
                                setSlideDirection(i > slideIndex ? 1 : -1);
                                setSlideIndex(i);
                              }}
                              className={`h-2 rounded-full transition-all ${
                                i === slideIndex ? "w-6 bg-ember-500" : "w-2 bg-night-700 hover:bg-night-600"
                              }`}
                              aria-label={`Go to slide ${i + 1}`}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* MEMBER STATS SCORECARD TABLES */}
                    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                      {/* TEAM A SCORECARD */}
                      <div className="rounded-xl sm:rounded-2xl border border-blue-900/40 bg-night-850 p-3.5 sm:p-5 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2.5 sm:pb-3 mb-3 sm:mb-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <span className="font-display font-bold text-sm sm:text-base uppercase text-blue-400 truncate max-w-[180px] sm:max-w-none">
                              {current.team1?.team_name ?? "Team A"} Roster
                            </span>
                          </div>
                          <span className="font-mono text-[11px] sm:text-xs font-bold text-blue-300 bg-blue-950/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-blue-800/40 whitespace-nowrap">
                            Total: {score1} PTS
                          </span>
                        </div>

                        <div className="overflow-x-auto -mx-1 px-1">
                          <table className="w-full min-w-[440px] text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-750 text-[10px] uppercase tracking-wider text-zinc-400 bg-night-800/60">
                                <th className="py-2 px-2.5">Member</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-center">K/D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/70">
                              {pList1.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                                    No member stats recorded yet for this team.
                                  </td>
                                </tr>
                              ) : (
                                pList1.map((p, idx) => {
                                  const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
                                  return (
                                    <tr key={idx} className="hover:bg-night-800/40 transition-colors">
                                      <td className="py-2 px-2.5 font-bold text-white truncate max-w-[110px] sm:max-w-[130px]">{p.name}</td>
                                      <td className="py-2 px-2 text-right font-bold text-amber-400">{p.score}</td>
                                      <td className="py-2 px-2 text-center text-green-400">{p.kills}</td>
                                      <td className="py-2 px-2 text-center text-blue-400">{p.assists}</td>
                                      <td className="py-2 px-2 text-center text-red-400">{p.deaths}</td>
                                      <td className="py-2 px-2 text-center text-zinc-300">{kd}</td>
                                      <td className="py-2 px-2 text-right text-zinc-400">{p.ping}ms</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* TEAM B SCORECARD */}
                      <div className="rounded-xl sm:rounded-2xl border border-red-900/40 bg-night-850 p-3.5 sm:p-5 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2.5 sm:pb-3 mb-3 sm:mb-4">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500 flex-shrink-0" />
                            <span className="font-display font-bold text-sm sm:text-base uppercase text-red-400 truncate max-w-[180px] sm:max-w-none">
                              {current.team2?.team_name ?? "Team B"} Roster
                            </span>
                          </div>
                          <span className="font-mono text-[11px] sm:text-xs font-bold text-red-300 bg-red-950/60 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded border border-red-800/40 whitespace-nowrap">
                            Total: {score2} PTS
                          </span>
                        </div>

                        <div className="overflow-x-auto -mx-1 px-1">
                          <table className="w-full min-w-[440px] text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-750 text-[10px] uppercase tracking-wider text-zinc-400 bg-night-800/60">
                                <th className="py-2 px-2.5">Member</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-center">K/D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/70">
                              {pList2.length === 0 ? (
                                <tr>
                                  <td colSpan={7} className="py-6 text-center text-zinc-500">
                                    No member stats recorded yet for this team.
                                  </td>
                                </tr>
                              ) : (
                                pList2.map((p, idx) => {
                                  const kd = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
                                  return (
                                    <tr key={idx} className="hover:bg-night-800/40 transition-colors">
                                      <td className="py-2 px-2.5 font-bold text-white truncate max-w-[110px] sm:max-w-[130px]">{p.name}</td>
                                      <td className="py-2 px-2 text-right font-bold text-amber-400">{p.score}</td>
                                      <td className="py-2 px-2 text-center text-green-400">{p.kills}</td>
                                      <td className="py-2 px-2 text-center text-blue-400">{p.assists}</td>
                                      <td className="py-2 px-2 text-center text-red-400">{p.deaths}</td>
                                      <td className="py-2 px-2 text-center text-zinc-300">{kd}</td>
                                      <td className="py-2 px-2 text-right text-zinc-400">{p.ping}ms</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* SECTION 2: OFFICIAL TOURNAMENT STANDINGS */}
      {hasAnyScores ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="section-title text-lg sm:text-xl">Overall Team Standings</h2>
            <span className="font-mono text-xs text-zinc-400">{rows.length} Active Teams</span>
          </div>

          {/* MOBILE CARD VIEW (Optimized for Phones < 640px) */}
          <div className="block sm:hidden space-y-3">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs card">
                Loading standings…
              </div>
            ) : rows.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs card">
                No approved teams yet.
              </div>
            ) : (
              rows.map((r) => (
                <div
                  key={r.id}
                  className={`card p-4 space-y-3 border ${
                    r.rank === 1
                      ? "border-amber-500/40 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                      : r.rank === 2
                      ? "border-zinc-400/30 bg-zinc-400/5"
                      : r.rank === 3
                      ? "border-amber-700/30 bg-amber-700/5"
                      : "border-night-700 bg-night-850"
                  }`}
                >
                  {/* Top Row: Rank + Team + Points */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center font-mono font-black text-sm w-7 h-7 rounded-lg bg-night-800 border border-night-700 flex-shrink-0">
                        {r.rank === 1 ? (
                          <span className="text-amber-400">👑</span>
                        ) : (
                          <span className={r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-zinc-400"}>
                            #{r.rank}
                          </span>
                        )}
                      </div>
                      <TeamMark name={r.team_name} logoUrl={r.logo_url} size={28} />
                      <div className="font-display font-bold text-white uppercase text-sm truncate">
                        {r.team_name}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 bg-night-800/90 border border-night-700 px-2.5 py-1 rounded-lg">
                      <span className="font-mono text-base font-black text-amber-400">{r.points}</span>
                      <span className="font-mono text-[9px] text-zinc-500 ml-1">PTS</span>
                    </div>
                  </div>

                  {/* Bottom Stats Grid */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-night-800/80 font-mono text-[10px] text-center">
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Played</div>
                      <div className="font-bold text-zinc-300 mt-0.5">{r.played}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">W - L - D</div>
                      <div className="font-bold text-white mt-0.5">
                        <span className="text-green-400">{r.wins}</span>-<span className="text-red-400">{r.losses}</span>-<span className="text-zinc-400">{r.draws}</span>
                      </div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Win %</div>
                      <div className="font-bold text-zinc-200 mt-0.5">{r.win_rate}%</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Maps</div>
                      <div className="font-bold text-zinc-300 mt-0.5">{r.maps_won}–{r.maps_lost}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DESKTOP & TABLET TABLE VIEW (Hidden on mobile < 640px) */}
          <div className="hidden sm:block card overflow-x-auto shadow-2xl">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-night-700 bg-night-800 text-left font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  <th className="px-5 py-4 w-16">#</th>
                  <th className="px-5 py-4">Team</th>
                  <th className="px-4 py-4 text-center w-24">PTS</th>
                  <th className="px-4 py-4 text-center w-20">Played</th>
                  <th className="px-4 py-4 text-center w-16 text-green-400">W</th>
                  <th className="px-4 py-4 text-center w-16 text-red-400">L</th>
                  <th className="px-4 py-4 text-center w-16 text-zinc-400">D</th>
                  <th className="px-4 py-4 text-center w-24">Win rate</th>
                  <th className="px-4 py-4 text-center w-28">Maps (W–L)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-800">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-zinc-500 font-mono">
                      Loading standings…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center text-zinc-500 font-mono">
                      No approved teams yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    return (
                      <tr
                        key={r.id}
                        className={`font-mono transition-colors hover:bg-night-850/80 ${
                          r.rank === 1
                            ? "bg-amber-500/5"
                            : r.rank === 2
                            ? "bg-zinc-400/5"
                            : r.rank === 3
                            ? "bg-amber-700/5"
                            : ""
                        }`}
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-bold text-base ${
                                r.rank === 1
                                  ? "text-amber-400"
                                  : r.rank === 2
                                  ? "text-zinc-300"
                                  : r.rank === 3
                                  ? "text-amber-600"
                                  : "text-zinc-500"
                              }`}
                            >
                              {String(r.rank).padStart(2, "0")}
                            </span>
                            {r.rank === 1 && <span className="text-amber-400">👑</span>}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <TeamMark name={r.team_name} logoUrl={r.logo_url} size={32} />
                        </td>
                        <td className="px-4 py-4 text-center text-xl font-black text-amber-400">{r.points}</td>
                        <td className="px-4 py-4 text-center text-zinc-400">{r.played}</td>
                        <td className="px-4 py-4 text-center font-bold text-green-400">{r.wins}</td>
                        <td className="px-4 py-4 text-center font-bold text-red-400">{r.losses}</td>
                        <td className="px-4 py-4 text-center font-bold text-zinc-400">{r.draws}</td>
                        <td className="px-4 py-4 text-center font-bold text-zinc-200">{r.win_rate}%</td>
                        <td className="px-4 py-4 text-center text-zinc-400">
                          {r.maps_won}–{r.maps_lost}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl sm:rounded-3xl border border-night-700/60 bg-gradient-to-b from-night-850/80 to-night-900/90 p-6 sm:p-10 text-center shadow-2xl backdrop-blur-md">
          <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl border border-ember-500/30 bg-ember-600/10 text-2xl sm:text-3xl text-ember-400 shadow-[0_0_25px_rgba(249,115,22,0.2)]">
            🎯
          </div>
          <h2 className="font-display text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
            Standings Awaiting Match Scores
          </h2>
          <p className="mx-auto mt-2 max-w-lg font-mono text-[11px] sm:text-xs text-zinc-400 leading-relaxed px-2">
            Team rankings, scores, and win/loss statistics will appear here automatically as soon as match results are recorded by tournament officials.
          </p>
          <div className="mt-5 sm:mt-6 inline-flex items-center gap-2 rounded-full border border-night-700 bg-night-800/80 px-3.5 sm:px-4 py-1.5 font-mono text-[11px] sm:text-xs text-zinc-400">
            <span className="h-2 w-2 rounded-full bg-ember-400 animate-pulse" />
            Live sync active // Auto-refreshing every 5 minutes
          </div>
        </div>
      )}
    </div>
  );
}
