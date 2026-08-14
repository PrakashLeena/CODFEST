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
    x: dir >= 0 ? 300 : -300,
    opacity: 0,
    scale: 0.96,
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
    x: dir >= 0 ? -300 : 300,
    opacity: 0,
    scale: 0.96,
    transition: {
      x: { type: "spring", stiffness: 320, damping: 30 },
      opacity: { duration: 0.2 },
    },
  }),
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [clashes, setClashes] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Slide carousel state
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [autoSlide, setAutoSlide] = useState(true);

  const load = useCallback(async () => {
    try {
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
    } catch {
      // silent fallback
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 2500);
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

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10 space-y-12">
      {/* HEADER TITLE */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-night-700 pb-6">
        <div>
          <h1 className="section-title text-3xl sm:text-4xl">Tournament Leaderboard</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-400">
            Official Standings // Match Clashes // Real-Time Scorecards
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-ember-500/30 bg-ember-600/10 px-3.5 py-1 font-mono text-xs text-ember-400">
          <span className="h-2 w-2 rounded-full bg-ember-400 animate-pulse" />
          LIVE LEADERBOARD SYNC
        </div>
      </div>

      {/* SECTION 1: ANIMATED MATCH CLASH SHOWCASE CAROUSEL */}
      {clashes.length > 0 && (
        <div className="rounded-3xl border border-night-700/80 bg-gradient-to-b from-night-850 to-night-900 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-night-750 pb-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-ember-500 animate-ping" />
                <h2 className="font-display text-xl font-bold uppercase tracking-wider text-white">
                  Featured Match Clashes
                </h2>
              </div>
              <p className="mt-1 font-mono text-xs text-zinc-400">
                Team vs Team clashes with full member stats and right-side slide transitions
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setAutoSlide(!autoSlide)}
                className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition-all ${
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
                  className="rounded px-3 py-1 text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Previous clash slide"
                >
                  ◀
                </button>
                <span className="font-mono text-xs font-bold text-ember-400 px-2">
                  {slideIndex + 1} / {clashes.length}
                </span>
                <button
                  onClick={nextSlide}
                  className="rounded px-3 py-1 text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Next clash slide"
                >
                  ▶
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE CONTENT */}
          <div className="relative overflow-hidden min-h-[440px]">
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
                    className="w-full space-y-6"
                  >
                    {/* TEAM A vs TEAM B CLASH HEADER */}
                    <div className="relative overflow-hidden rounded-2xl border border-night-700 bg-gradient-to-r from-blue-950/40 via-night-850 to-red-950/40 p-6 shadow-2xl">
                      <div className="flex flex-wrap items-center justify-between gap-6">
                        {/* TEAM A */}
                        <div className="flex items-center gap-4 flex-1 min-w-[220px]">
                          <div
                            className={`relative rounded-2xl border-2 p-1.5 transition-all ${
                              isWinner1
                                ? "border-amber-400 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                                : "border-night-700 bg-night-800"
                            }`}
                          >
                            <TeamMark
                              name={current.team1?.team_name ?? "Team A"}
                              logoUrl={current.team1?.logo_url}
                              size={68}
                            />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-400">
                                TEAM A
                              </span>
                              {isWinner1 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-400 border border-amber-500/40 animate-pulse">
                                  🏆 VICTORY
                                </span>
                              )}
                            </div>
                            <h3 className="mt-1 font-display text-2xl font-black uppercase text-white truncate max-w-[240px]">
                              {current.team1?.team_name ?? "Team A"}
                            </h3>
                            <div className="mt-1 font-mono text-3xl font-black text-blue-400">
                              {score1} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                        </div>

                        {/* VS BADGE & MAP INFO */}
                        <div className="text-center px-4">
                          <div className="inline-flex items-center justify-center rounded-full border border-ember-500/50 bg-gradient-to-r from-ember-600/30 to-orange-600/30 px-5 py-2 font-display text-xl font-black tracking-widest text-ember-400 shadow-[0_0_20px_rgba(249,115,22,0.5)] animate-pulse">
                            VS
                          </div>
                          <div className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-zinc-300">
                            MAP: <span className="text-ember-400">{current.map || "Crash"}</span>
                          </div>
                          <div className="font-mono text-[11px] text-zinc-500">
                            {ROUND_NAMES[current.round] ?? `Round ${current.round}`}
                          </div>
                          <div className="mt-1">
                            <StatusBadge status={current.status} />
                          </div>
                        </div>

                        {/* TEAM B */}
                        <div className="flex items-center justify-end gap-4 flex-1 min-w-[220px] text-right">
                          <div>
                            <div className="flex items-center justify-end gap-2">
                              {isWinner2 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-400 border border-amber-500/40 animate-pulse">
                                  🏆 VICTORY
                                </span>
                              )}
                              <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-red-400">
                                TEAM B
                              </span>
                            </div>
                            <h3 className="mt-1 font-display text-2xl font-black uppercase text-white truncate max-w-[240px]">
                              {current.team2?.team_name ?? "Team B"}
                            </h3>
                            <div className="mt-1 font-mono text-3xl font-black text-red-400">
                              {score2} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                          <div
                            className={`relative rounded-2xl border-2 p-1.5 transition-all ${
                              isWinner2
                                ? "border-amber-400 bg-amber-500/10 shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                                : "border-night-700 bg-night-800"
                            }`}
                          >
                            <TeamMark
                              name={current.team2?.team_name ?? "Team B"}
                              logoUrl={current.team2?.logo_url}
                              size={68}
                            />
                          </div>
                        </div>
                      </div>

                      {/* WINNER CALCULATION BANNER */}
                      <div className="mt-4 flex items-center justify-between border-t border-night-800 pt-3">
                        <div className="font-mono text-xs text-zinc-400 flex items-center gap-2">
                          <span>Calculated Outcome:</span>
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
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* TEAM A SCORECARD */}
                      <div className="rounded-2xl border border-blue-900/40 bg-night-850 p-5 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-3 mb-4">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                            <span className="font-display font-bold text-base uppercase text-blue-400">
                              {current.team1?.team_name ?? "Team A"} Roster Stats
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-blue-300 bg-blue-950/60 px-2.5 py-1 rounded border border-blue-800/40">
                            Team Total: {score1} PTS
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-750 text-[10px] uppercase tracking-wider text-zinc-400 bg-night-800/60">
                                <th className="py-2.5 px-3">Member</th>
                                <th className="py-2.5 px-3 text-right">Score</th>
                                <th className="py-2.5 px-3 text-center">K</th>
                                <th className="py-2.5 px-3 text-center">A</th>
                                <th className="py-2.5 px-3 text-center">D</th>
                                <th className="py-2.5 px-3 text-center">K/D</th>
                                <th className="py-2.5 px-3 text-right">Ping</th>
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
                                      <td className="py-2.5 px-3 font-bold text-white truncate max-w-[130px]">{p.name}</td>
                                      <td className="py-2.5 px-3 text-right font-bold text-amber-400">{p.score}</td>
                                      <td className="py-2.5 px-3 text-center text-green-400">{p.kills}</td>
                                      <td className="py-2.5 px-3 text-center text-blue-400">{p.assists}</td>
                                      <td className="py-2.5 px-3 text-center text-red-400">{p.deaths}</td>
                                      <td className="py-2.5 px-3 text-center text-zinc-300">{kd}</td>
                                      <td className="py-2.5 px-3 text-right text-zinc-400">{p.ping}ms</td>
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* TEAM B SCORECARD */}
                      <div className="rounded-2xl border border-red-900/40 bg-night-850 p-5 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-3 mb-4">
                          <div className="flex items-center gap-2.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                            <span className="font-display font-bold text-base uppercase text-red-400">
                              {current.team2?.team_name ?? "Team B"} Roster Stats
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-red-300 bg-red-950/60 px-2.5 py-1 rounded border border-red-800/40">
                            Team Total: {score2} PTS
                          </span>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-750 text-[10px] uppercase tracking-wider text-zinc-400 bg-night-800/60">
                                <th className="py-2.5 px-3">Member</th>
                                <th className="py-2.5 px-3 text-right">Score</th>
                                <th className="py-2.5 px-3 text-center">K</th>
                                <th className="py-2.5 px-3 text-center">A</th>
                                <th className="py-2.5 px-3 text-center">D</th>
                                <th className="py-2.5 px-3 text-center">K/D</th>
                                <th className="py-2.5 px-3 text-right">Ping</th>
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
                                      <td className="py-2.5 px-3 font-bold text-white truncate max-w-[130px]">{p.name}</td>
                                      <td className="py-2.5 px-3 text-right font-bold text-amber-400">{p.score}</td>
                                      <td className="py-2.5 px-3 text-center text-green-400">{p.kills}</td>
                                      <td className="py-2.5 px-3 text-center text-blue-400">{p.assists}</td>
                                      <td className="py-2.5 px-3 text-center text-red-400">{p.deaths}</td>
                                      <td className="py-2.5 px-3 text-center text-zinc-300">{kd}</td>
                                      <td className="py-2.5 px-3 text-right text-zinc-400">{p.ping}ms</td>
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

      {/* SECTION 2: OFFICIAL TOURNAMENT STANDINGS TABLE */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title text-xl">Overall Team Standings</h2>
          <span className="font-mono text-xs text-zinc-400">{rows.length} Active Teams</span>
        </div>

        <div className="card overflow-x-auto shadow-2xl">
          <table className="w-full min-w-[720px] text-sm">
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
                  const isTop3 = r.rank <= 3;
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
    </div>
  );
}
