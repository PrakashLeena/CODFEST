"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import TeamMark from "@/components/TeamMark";
import StatusBadge from "@/components/StatusBadge";
import { useSocketEvents } from "@/hooks/useSocket";
import { ROUND_NAMES, type Match } from "@/lib/types";
import type { PlayerKillStat } from "@/lib/standings";

interface LeaderboardRow {
  rank: number;
  id: string;
  team_name: string;
  logo_url: string | null;
  category?: "boys" | "girls";
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
  const [boysRows, setBoysRows] = useState<LeaderboardRow[]>([]);
  const [girlsRows, setGirlsRows] = useState<LeaderboardRow[]>([]);
  const [clashes, setClashes] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Division split filter state ("all" | "boys" | "girls")
  const [division, setDivision] = useState<"all" | "boys" | "girls">("all");
  const [viewMode, setViewMode] = useState<"standings" | "killers">("standings");

  // Top Killers states
  const [boysKillers, setBoysKillers] = useState<PlayerKillStat[]>([]);
  const [girlsKillers, setGirlsKillers] = useState<PlayerKillStat[]>([]);
  const [allKillers, setAllKillers] = useState<PlayerKillStat[]>([]);
  const [topKillerBoys, setTopKillerBoys] = useState<PlayerKillStat | null>(null);
  const [topKillerGirls, setTopKillerGirls] = useState<PlayerKillStat | null>(null);
  const [topKillerOverall, setTopKillerOverall] = useState<PlayerKillStat | null>(null);

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
      if (json.boys_leaderboard) setBoysRows(json.boys_leaderboard);
      if (json.girls_leaderboard) setGirlsRows(json.girls_leaderboard);
      if (json.boys_top_killers) setBoysKillers(json.boys_top_killers);
      if (json.girls_top_killers) setGirlsKillers(json.girls_top_killers);
      if (json.all_top_killers) setAllKillers(json.all_top_killers);
      if (json.top_killer_boys) setTopKillerBoys(json.top_killer_boys);
      if (json.top_killer_girls) setTopKillerGirls(json.top_killer_girls);
      if (json.top_killer_overall) setTopKillerOverall(json.top_killer_overall);
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
    (event, data) => {
      if (event === "leaderboard:updated" && data) {
        if (data.leaderboard) setRows(data.leaderboard);
        if (data.boys_leaderboard) setBoysRows(data.boys_leaderboard);
        if (data.girls_leaderboard) setGirlsRows(data.girls_leaderboard);
        if (data.boys_top_killers) setBoysKillers(data.boys_top_killers);
        if (data.girls_top_killers) setGirlsKillers(data.girls_top_killers);
        if (data.all_top_killers) setAllKillers(data.all_top_killers);
        if (data.top_killer_boys) setTopKillerBoys(data.top_killer_boys);
        if (data.top_killer_girls) setTopKillerGirls(data.top_killer_girls);
        if (data.top_killer_overall) setTopKillerOverall(data.top_killer_overall);
        setLastUpdated(new Date());
      }
      load();
    }
  );

  const boysCount = (boysRows.length > 0 ? boysRows : rows.filter((r) => r.category === "boys")).length;
  const girlsCount = (girlsRows.length > 0 ? girlsRows : rows.filter((r) => r.category === "girls")).length;

  const displayRows = useMemo(() => {
    if (division === "boys") {
      return boysRows.length > 0
        ? boysRows
        : rows.filter((r) => (r.category ?? "boys") === "boys").map((r, i) => ({ ...r, rank: i + 1 }));
    }
    if (division === "girls") {
      return girlsRows.length > 0
        ? girlsRows
        : rows.filter((r) => r.category === "girls").map((r, i) => ({ ...r, rank: i + 1 }));
    }
    return rows;
  }, [rows, boysRows, girlsRows, division]);

  const displayKillers = useMemo(() => {
    if (division === "boys") return boysKillers;
    if (division === "girls") return girlsKillers;
    return allKillers;
  }, [division, boysKillers, girlsKillers, allKillers]);

  const activeTopKiller = useMemo(() => {
    if (division === "boys") return topKillerBoys;
    if (division === "girls") return topKillerGirls;
    return topKillerOverall;
  }, [division, topKillerBoys, topKillerGirls, topKillerOverall]);

  const displayClashes = useMemo(() => {
    if (division === "all") return clashes;
    return clashes.filter((c: any) => {
      const cat1 = c.team1_category ?? "boys";
      const cat2 = c.team2_category ?? "boys";
      return cat1 === division || cat2 === division;
    });
  }, [clashes, division]);

  const nextSlide = useCallback(() => {
    if (displayClashes.length <= 1) return;
    setSlideDirection(1);
    setSlideIndex((prev) => (prev + 1) % displayClashes.length);
  }, [displayClashes.length]);

  const prevSlide = useCallback(() => {
    if (displayClashes.length <= 1) return;
    setSlideDirection(-1);
    setSlideIndex((prev) => (prev - 1 + displayClashes.length) % displayClashes.length);
  }, [displayClashes.length]);

  useEffect(() => {
    if (!autoSlide || displayClashes.length <= 1) return;
    const timer = setInterval(nextSlide, 6000);
    return () => clearInterval(timer);
  }, [autoSlide, displayClashes.length, nextSlide]);

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
    <div className="site-gutter mx-auto max-w-7xl py-6 sm:py-10 space-y-8 sm:space-y-10 px-3 sm:px-6">
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

      {/* DIVISION SPLIT SWITCHER BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-night-700 bg-gradient-to-r from-night-850 via-night-900 to-night-850 p-3 sm:p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-ember-400" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-zinc-300">
            Division Category:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => { setDivision("all"); setSlideIndex(0); }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              division === "all"
                ? "border border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>All Teams</span>
            <span className="rounded-full bg-night-900 px-2 py-0.5 text-[10px] text-zinc-300 border border-night-700">
              {rows.length}
            </span>
          </button>

          <button
            onClick={() => { setDivision("boys"); setSlideIndex(0); }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              division === "boys"
                ? "border border-blue-500/70 bg-blue-600/25 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.35)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>Boys Division</span>
            <span className="rounded-full bg-blue-950 px-2 py-0.5 text-[10px] text-blue-300 border border-blue-500/30">
              {boysCount}
            </span>
          </button>

          <button
            onClick={() => { setDivision("girls"); setSlideIndex(0); }}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              division === "girls"
                ? "border border-pink-500/70 bg-pink-600/25 text-pink-300 shadow-[0_0_20px_rgba(236,72,153,0.35)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>Girls Division</span>
            <span className="rounded-full bg-pink-950 px-2 py-0.5 text-[10px] text-pink-300 border border-pink-500/30">
              {girlsCount}
            </span>
          </button>
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
                {autoSlide ? "Auto-slide ON" : "Auto-slide OFF"}
              </button>

              <div className="flex items-center gap-1 bg-night-800 p-1 rounded-lg border border-night-700">
                <button
                  onClick={prevSlide}
                  className="rounded px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Previous clash slide"
                >
                  &lsaquo;
                </button>
                <span className="font-mono text-xs font-bold text-ember-400 px-1.5 sm:px-2 whitespace-nowrap">
                  {slideIndex + 1} / {clashes.length}
                </span>
                <button
                  onClick={nextSlide}
                  className="rounded px-2.5 sm:px-3 py-1 text-xs sm:text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                  aria-label="Next clash slide"
                >
                  &rsaquo;
                </button>
              </div>
            </div>
          </div>

          {/* SLIDE CONTENT */}
          <div className="relative overflow-hidden min-h-[380px] sm:min-h-[440px]">
            <AnimatePresence initial={false} custom={slideDirection} mode="wait">
              {(() => {
                const current = displayClashes[slideIndex] ?? displayClashes[0];
                if (!current) return null;

                const sub1 = current.submission_team1 as any;
                const sub2 = current.submission_team2 as any;
                
                const padToFive = (list?: PlayerStatRow[]): PlayerStatRow[] => {
                  if (!list || list.length === 0) return [];
                  const res = [...list];
                  while (res.length < 5) {
                    res.push({
                      name: `Member ${res.length + 1}`,
                      score: 0,
                      kills: 0,
                      assists: 0,
                      deaths: 0,
                      ping: 35,
                    });
                  }
                  return res;
                };

                const pList1: PlayerStatRow[] = padToFive(sub1?.players);
                const pList2: PlayerStatRow[] = padToFive(sub2?.players);

                const score1 = current.final_score1 ?? sub1?.score_own ?? 0;
                const score2 = current.final_score2 ?? sub2?.score_own ?? 0;
                const isWinner1 = current.winner_id === current.team1?.id || (score1 > score2 && score1 > 0);
                const isWinner2 = current.winner_id === current.team2?.id || (score2 > score1 && score2 > 0);

                const cat1 = (current as any).team1_category ?? "boys";
                const cat2 = (current as any).team2_category ?? "boys";

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
                              <span className={`rounded px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase ${
                                cat1 === "girls"
                                  ? "border border-pink-500/40 bg-pink-500/20 text-pink-300"
                                  : "border border-blue-500/40 bg-blue-500/20 text-blue-300"
                              }`}>
                                {cat1 === "girls" ? "GIRLS" : "BOYS"}
                              </span>
                              {isWinner1 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 sm:px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase text-amber-400 border border-amber-500/40 animate-pulse">
                                  VICTORY
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
                                  VICTORY
                                </span>
                              )}
                              <span className={`rounded px-2 py-0.5 font-mono text-[9px] sm:text-[10px] font-bold uppercase ${
                                cat2 === "girls"
                                  ? "border border-pink-500/40 bg-pink-500/20 text-pink-300"
                                  : "border border-blue-500/40 bg-blue-500/20 text-blue-300"
                              }`}>
                                {cat2 === "girls" ? "GIRLS" : "BOYS"}
                              </span>
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
                          {displayClashes.map((_, i) => (
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

                    {/* SCORECARD TABLES */}
                    <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
                      {/* TEAM A STATS TABLE */}
                      <div className="rounded-xl sm:rounded-2xl border border-blue-900/40 bg-night-850 p-3 sm:p-4 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                            <span className="font-display text-xs sm:text-sm font-bold uppercase text-blue-400 truncate max-w-[200px]">
                              {current.team1?.team_name ?? "Team A"} Scorecard
                            </span>
                          </div>
                          <span className="font-mono text-xs font-black text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/30">
                            Total: {score1} PTS
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-700 text-[10px] uppercase text-zinc-500 bg-night-800/40">
                                <th className="py-2 px-2.5">Player</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-center">K/D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/60">
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
                                      <td className="py-2 px-2.5 font-bold text-white truncate max-w-[130px]">{p.name}</td>
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

                      {/* TEAM B STATS TABLE */}
                      <div className="rounded-xl sm:rounded-2xl border border-red-900/40 bg-night-850 p-3 sm:p-4 shadow-xl">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                            <span className="font-display text-xs sm:text-sm font-bold uppercase text-red-400 truncate max-w-[200px]">
                              {current.team2?.team_name ?? "Team B"} Scorecard
                            </span>
                          </div>
                          <span className="font-mono text-xs font-black text-red-300 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/30">
                            Total: {score2} PTS
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-700 text-[10px] uppercase text-zinc-500 bg-night-800/40">
                                <th className="py-2 px-2.5">Player</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-center">K/D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/60">
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
                                      <td className="py-2 px-2.5 font-bold text-white truncate max-w-[130px]">{p.name}</td>
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

      {/* VIEW MODE TABS & MOST KILLER SPOTLIGHT */}
      <div className="space-y-6">
        {/* VIEW MODE SELECTOR (Team Standings vs Top Killers) */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-night-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode("standings")}
              className={`rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
                viewMode === "standings"
                  ? "border border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              Team Standings
            </button>
            <button
              onClick={() => setViewMode("killers")}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
                viewMode === "killers"
                  ? "border border-red-500/60 bg-red-600/25 text-red-300 shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                  : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              <span>Most Lethal Killers</span>
              {displayKillers.length > 0 && (
                <span className="rounded-full bg-red-950 px-2 py-0.2 text-[10px] text-red-300 border border-red-500/40">
                  {displayKillers.length}
                </span>
              )}
            </button>
          </div>

          <div className="font-mono text-xs text-zinc-400">
            {viewMode === "standings"
              ? division === "all"
                ? "Ranking by Team Cumulative Score"
                : `Ranking strictly by Match Wins & Losses (${division === "boys" ? "Boys" : "Girls"} Division)`
              : "Auto-Calculated by Total Player Kills"}
          </div>
        </div>

        {/* MOST KILLER MVP SHOWCASE SPOTLIGHT BANNER */}
        {(topKillerBoys || topKillerGirls || topKillerOverall) && (
          <div className="rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-950/30 via-night-850 to-night-900 p-4 sm:p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-night-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                <h3 className="font-display text-sm sm:text-base font-bold uppercase tracking-wider text-white">
                  {division === "boys"
                    ? "Boys Division - Kill Leader (MVP)"
                    : division === "girls"
                    ? "Girls Division - Kill Leader (MVP)"
                    : "Tournament Kill Leaders (MVP)"}
                </h3>
              </div>
              <span className="font-mono text-[11px] text-red-400 uppercase tracking-widest border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 rounded-full">
                Auto-Detected From Match Scores
              </span>
            </div>

            <div className={`grid gap-4 ${division === "all" ? "md:grid-cols-2" : "grid-cols-1"}`}>
              {/* BOYS TOP KILLER CARD */}
              {(division === "boys" || (division === "all" && topKillerBoys)) && topKillerBoys && (
                <div className="rounded-xl border border-blue-500/40 bg-night-800/80 p-4 relative overflow-hidden shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-300 border border-blue-500/30">
                          BOYS KILL LEADER
                        </span>
                        <span className="font-mono text-[11px] text-amber-400 font-bold">#1 TOP FRAGGER</span>
                      </div>
                      <h4 className="mt-1 font-display text-xl sm:text-2xl font-black uppercase text-white truncate">
                        {topKillerBoys.name}
                      </h4>
                      <p className="font-mono text-xs text-zinc-400">Team: <strong className="text-zinc-200">{topKillerBoys.team_name}</strong></p>
                    </div>

                    <div className="text-right bg-night-900 border border-blue-500/30 px-3.5 py-2 rounded-xl">
                      <div className="font-mono text-2xl sm:text-3xl font-black text-red-400">
                        {topKillerBoys.total_kills}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                        TOTAL KILLS
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-night-700/60 pt-2.5 font-mono text-[11px] text-center">
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">K/D Ratio</div>
                      <div className="font-bold text-green-400 mt-0.5">{topKillerBoys.kd_ratio}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Matches</div>
                      <div className="font-bold text-zinc-300 mt-0.5">{topKillerBoys.matches_played}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Avg K/M</div>
                      <div className="font-bold text-blue-300 mt-0.5">{topKillerBoys.avg_kills}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Best Match</div>
                      <div className="font-bold text-amber-400 mt-0.5">{topKillerBoys.max_kills_single_match} K</div>
                    </div>
                  </div>
                </div>
              )}

              {/* GIRLS TOP KILLER CARD */}
              {(division === "girls" || (division === "all" && topKillerGirls)) && topKillerGirls && (
                <div className="rounded-xl border border-pink-500/40 bg-night-800/80 p-4 relative overflow-hidden shadow-lg">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-pink-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-pink-300 border border-pink-500/30">
                          GIRLS KILL LEADER
                        </span>
                        <span className="font-mono text-[11px] text-amber-400 font-bold">#1 TOP FRAGGER</span>
                      </div>
                      <h4 className="mt-1 font-display text-xl sm:text-2xl font-black uppercase text-white truncate">
                        {topKillerGirls.name}
                      </h4>
                      <p className="font-mono text-xs text-zinc-400">Team: <strong className="text-zinc-200">{topKillerGirls.team_name}</strong></p>
                    </div>

                    <div className="text-right bg-night-900 border border-pink-500/30 px-3.5 py-2 rounded-xl">
                      <div className="font-mono text-2xl sm:text-3xl font-black text-pink-400">
                        {topKillerGirls.total_kills}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 font-bold">
                        TOTAL KILLS
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2 border-t border-night-700/60 pt-2.5 font-mono text-[11px] text-center">
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">K/D Ratio</div>
                      <div className="font-bold text-green-400 mt-0.5">{topKillerGirls.kd_ratio}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Matches</div>
                      <div className="font-bold text-zinc-300 mt-0.5">{topKillerGirls.matches_played}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Avg K/M</div>
                      <div className="font-bold text-pink-300 mt-0.5">{topKillerGirls.avg_kills}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-700/50">
                      <div className="text-zinc-500 text-[9px] uppercase">Best Match</div>
                      <div className="font-bold text-amber-400 mt-0.5">{topKillerGirls.max_kills_single_match} K</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: VIEW TOGGLE DISPLAY (STANDINGS vs TOP KILLERS TABLE) */}
      {viewMode === "killers" ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="section-title text-lg sm:text-xl">
                {division === "boys"
                  ? "Boys Division - Most Killers Leaderboard"
                  : division === "girls"
                  ? "Girls Division - Most Killers Leaderboard"
                  : "Overall Tournament - Most Killers Leaderboard"}
              </h2>
              <p className="font-mono text-xs text-zinc-400">
                Individual player kill leaderboard computed automatically across all recorded matches
              </p>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              {displayKillers.length} {displayKillers.length === 1 ? "Player" : "Players"}
            </span>
          </div>

          {/* MOBILE KILLERS LIST */}
          <div className="block sm:hidden space-y-3">
            {displayKillers.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs card">
                No player kill statistics recorded yet in this division.
              </div>
            ) : (
              displayKillers.map((k) => (
                <div
                  key={`${k.name}-${k.team_id}`}
                  className={`card p-4 space-y-3 border ${
                    k.rank === 1
                      ? "border-red-500/40 bg-red-500/5 shadow-[0_0_15px_rgba(239,68,68,0.15)]"
                      : "border-night-700 bg-night-850"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center font-mono font-black text-sm w-7 h-7 rounded-lg bg-night-800 border border-night-700 flex-shrink-0 text-amber-400">
                        #{k.rank}
                      </div>
                      <div className="min-w-0">
                        <div className="font-display font-bold text-white uppercase text-sm truncate">
                          {k.name}
                        </div>
                        <div className="font-mono text-xs text-zinc-400 truncate">
                          Team: {k.team_name}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0 bg-night-800/90 border border-red-500/30 px-3 py-1 rounded-lg">
                      <span className="font-mono text-lg font-black text-red-400">{k.total_kills}</span>
                      <span className="font-mono text-[9px] text-zinc-500 ml-1">KILLS</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-night-800/80 font-mono text-[10px] text-center">
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">K/D</div>
                      <div className="font-bold text-green-400 mt-0.5">{k.kd_ratio}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Deaths</div>
                      <div className="font-bold text-red-400 mt-0.5">{k.total_deaths}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Assists</div>
                      <div className="font-bold text-blue-400 mt-0.5">{k.total_assists}</div>
                    </div>
                    <div className="bg-night-900/60 p-1.5 rounded border border-night-800">
                      <div className="text-zinc-500 text-[9px] uppercase">Score</div>
                      <div className="font-bold text-amber-400 mt-0.5">{k.total_score}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* DESKTOP KILLERS TABLE */}
          <div className="hidden sm:block card overflow-x-auto shadow-2xl">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-night-700 bg-night-800 text-left font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                  <th className="px-5 py-4 w-16"># Rank</th>
                  <th className="px-5 py-4">Player Name</th>
                  <th className="px-5 py-4">Team</th>
                  <th className="px-4 py-4 text-center w-24">Division</th>
                  <th className="px-4 py-4 text-center w-24 text-red-400">Total Kills</th>
                  <th className="px-4 py-4 text-center w-20 text-green-400">K/D</th>
                  <th className="px-4 py-4 text-center w-20">Assists</th>
                  <th className="px-4 py-4 text-center w-20">Deaths</th>
                  <th className="px-4 py-4 text-center w-24">Avg K/M</th>
                  <th className="px-4 py-4 text-center w-24 text-amber-400">Total Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-800">
                {displayKillers.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-zinc-500 font-mono">
                      No player kill statistics recorded yet in this division.
                    </td>
                  </tr>
                ) : (
                  displayKillers.map((k) => (
                    <tr
                      key={`${k.name}-${k.team_id}`}
                      className={`font-mono transition-colors hover:bg-night-850/80 ${
                        k.rank === 1 ? "bg-red-500/5" : ""
                      }`}
                    >
                      <td className="px-5 py-4 font-bold text-amber-400">
                        #{k.rank}
                      </td>
                      <td className="px-5 py-4 font-bold text-white">
                        {k.name}
                      </td>
                      <td className="px-5 py-4 text-zinc-300">
                        {k.team_name}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold ${
                          k.category === "girls"
                            ? "border border-pink-500/50 bg-pink-500/10 text-pink-300"
                            : "border border-blue-500/50 bg-blue-500/10 text-blue-300"
                        }`}>
                          {k.category === "girls" ? "Girls" : "Boys"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center font-black text-xl text-red-400">
                        {k.total_kills}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-green-400">
                        {k.kd_ratio}
                      </td>
                      <td className="px-4 py-4 text-center text-blue-400">
                        {k.total_assists}
                      </td>
                      <td className="px-4 py-4 text-center text-red-300">
                        {k.total_deaths}
                      </td>
                      <td className="px-4 py-4 text-center text-zinc-300">
                        {k.avg_kills}
                      </td>
                      <td className="px-4 py-4 text-center font-bold text-amber-400">
                        {k.total_score}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : hasAnyScores ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="section-title text-lg sm:text-xl">
                {division === "boys"
                  ? "Boys Division Standings (Ranked by W-L Record)"
                  : division === "girls"
                  ? "Girls Division Standings (Ranked by W-L Record)"
                  : "Overall Team Standings"}
              </h2>
              <p className="font-mono text-xs text-zinc-400">
                {division === "all"
                  ? "Showing all registered teams across all divisions (ranked by cumulative player score)"
                  : `Official ${division === "boys" ? "Boys" : "Girls"} division standings ranked strictly by Match Wins and Losses (W–L Record)`}
              </p>
            </div>
            <span className="font-mono text-xs text-zinc-400">
              {displayRows.length} {displayRows.length === 1 ? "Team" : "Teams"}
            </span>
          </div>

          {/* MOBILE CARD VIEW (Optimized for Phones < 640px) */}
          <div className="block sm:hidden space-y-3">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs card">
                Loading standings…
              </div>
            ) : displayRows.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 font-mono text-xs card">
                No teams found in this division.
              </div>
            ) : (
              displayRows.map((r) => (
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
                  {/* Top Row: Rank + Team + Category + Points */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="flex items-center justify-center font-mono font-black text-sm w-7 h-7 rounded-lg bg-night-800 border border-night-700 flex-shrink-0">
                        <span className={r.rank === 1 ? "text-amber-400" : r.rank === 2 ? "text-zinc-300" : r.rank === 3 ? "text-amber-600" : "text-zinc-400"}>
                          #{r.rank}
                        </span>
                      </div>
                      <TeamMark name={r.team_name} logoUrl={r.logo_url} size={28} />
                      <div className="min-w-0">
                        <div className="font-display font-bold text-white uppercase text-sm truncate">
                          {r.team_name}
                        </div>
                        <div className="mt-0.5">
                          {r.category === "girls" ? (
                            <span className="inline-block rounded border border-pink-500/40 bg-pink-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-pink-300">
                              GIRLS
                            </span>
                          ) : (
                            <span className="inline-block rounded border border-blue-500/40 bg-blue-500/10 px-1.5 py-0.2 font-mono text-[9px] font-bold text-blue-300">
                              BOYS
                            </span>
                          )}
                        </div>
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
                  <th className="px-4 py-4 text-center w-24">Division</th>
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
                    <td colSpan={10} className="px-4 py-16 text-center text-zinc-500 font-mono">
                      Loading standings…
                    </td>
                  </tr>
                ) : displayRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-16 text-center text-zinc-500 font-mono">
                      No teams found in this division.
                    </td>
                  </tr>
                ) : (
                  displayRows.map((r) => {
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
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <TeamMark name={r.team_name} logoUrl={r.logo_url} size={32} />
                        </td>
                        <td className="px-4 py-4 text-center">
                          {r.category === "girls" ? (
                            <span className="rounded-full border border-pink-500/50 bg-pink-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-pink-300 shadow-[0_0_10px_rgba(236,72,153,0.2)]">
                              Girls
                            </span>
                          ) : (
                            <span className="rounded-full border border-blue-500/50 bg-blue-500/10 px-2.5 py-1 font-mono text-[10px] font-bold text-blue-300 shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                              Boys
                            </span>
                          )}
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
          <div className="mx-auto mb-3 sm:mb-4 flex h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-xl sm:rounded-2xl border border-ember-500/30 bg-ember-600/10 text-ember-400 shadow-[0_0_25px_rgba(249,115,22,0.2)]">
            <svg
              className="h-6 w-6 sm:h-8 sm:w-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
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
