"use client";

import { motion } from "framer-motion";
import { ROUND_NAMES, type Match } from "@/lib/types";

/** Single-elimination bracket — tactical boxed style with Framer Motion animations. */
export default function BracketView({ bracket }: { bracket: Match[] }) {
  if (bracket.length === 0) {
    return (
      <p className="mt-10 text-center font-mono text-sm text-zinc-500">
        // BRACKET NOT GENERATED — AWAITING DEPLOYMENT
      </p>
    );
  }

  const rounds = new Map<number, Match[]>();
  for (const m of bracket) {
    rounds.set(m.round, [...(rounds.get(m.round) ?? []), m]);
  }
  const roundNumbers = [...rounds.keys()].sort((a, b) => a - b);
  const maxRound = roundNumbers[roundNumbers.length - 1];
  const champion =
    rounds.get(maxRound)?.length === 1 && rounds.get(maxRound)![0].status === "finished"
      ? rounds.get(maxRound)![0]
      : null;

  return (
    <div className="mt-8 overflow-x-auto pb-4">
      <div className="flex min-w-max gap-10">
        {roundNumbers.map((r, rIdx) => (
          <motion.div
            key={r}
            initial={{ opacity: 0, x: -15 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: rIdx * 0.1 }}
            className="flex w-64 flex-col justify-around gap-5"
          >
            <h3 className="text-center font-mono text-xs font-bold tracking-[0.15em] text-zinc-400">
              {(ROUND_NAMES[r] ?? `ROUND ${r}`).toUpperCase()}
            </h3>
            {rounds
              .get(r)!
              .sort((a, b) => a.bracket_slot - b.bracket_slot)
              .map((m) => {
                const live = m.status === "live";
                return (
                  <motion.div
                    key={m.id}
                    whileHover={{ y: -2, borderColor: "rgba(113, 224, 0, 0.8)" }}
                    transition={{ duration: 0.2 }}
                    className={`border bg-night-850 transition-colors ${
                      live ? "border-ember-600/60 shadow-glow" : "border-night-700"
                    }`}
                  >
                    {live && (
                      <div className="border-b border-ember-600/40 bg-ember-600/10 px-2 py-0.5 font-mono text-[9px] text-ember-600 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-ember-600 animate-pulseLive" />
                        LIVE // IN PROGRESS
                      </div>
                    )}
                    {[
                      { team: m.team1, id: m.team1_id, score: m.final_score1 },
                      { team: m.team2, id: m.team2_id, score: m.final_score2 },
                    ].map((row, i) => {
                      const won = m.status === "finished" && m.winner_id === row.id && !!row.id;
                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between gap-2 px-3 py-2 ${
                            i === 0 ? "border-b border-night-700/60" : ""
                          }`}
                        >
                          <span
                            className={`truncate font-display text-base font-bold uppercase ${
                              won
                                ? "text-white"
                                : row.team
                                ? "text-zinc-300"
                                : "italic text-zinc-500"
                            }`}
                          >
                            {row.team?.team_name ?? "TBD"}
                          </span>
                          <span
                            className={`font-mono text-base ${
                              won ? "font-bold text-ember-600" : "text-zinc-500"
                            }`}
                          >
                            {m.status === "finished" ? row.score : "-"}
                          </span>
                        </div>
                      );
                    })}
                  </motion.div>
                );
              })}
          </motion.div>
        ))}

        {champion?.winner_id && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex w-72 flex-col justify-center"
          >
            <h3 className="text-center font-mono text-xs font-bold tracking-[0.15em] text-ember-600">
              GRAND CHAMPIONSHIP
            </h3>
            <div className="mt-4 border border-ember-600 bg-night-600 p-1 shadow-glowLg">
              <div className="border-b border-ember-600/30 pb-1 pt-1 text-center font-mono text-[10px] tracking-[0.1em] text-ember-600">
                CHAMPION CONFIRMED
              </div>
              <div className="bg-night-850 p-5 text-center">
                <div className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-ember-400">
                  VICTOR
                </div>
                <div className="mt-2 font-display text-2xl font-bold uppercase tracking-[0.05em] text-white">
                  {champion.winner_id === champion.team1_id
                    ? champion.team1?.team_name
                    : champion.team2?.team_name}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
