"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { motion } from "framer-motion";
import type { Announcement } from "@/lib/types";

interface LeaderboardImage {
  id: string;
  title: string | null;
  image_url: string;
  created_at: string;
}

export default function AnimatedHomeContent({
  mapPool,
  announcements,
  leaderboardImages = [],
}: {
  mapPool: string[];
  announcements: Announcement[];
  leaderboardImages?: LeaderboardImage[];
}) {
  return (
    <section className="site-gutter mx-auto max-w-7xl py-16 space-y-16">
      {/* ============ MISSION BRIEFING HEADER ============ */}
      <div>
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 border-b border-night-700 pb-4"
        >
          <svg width="25" height="23" viewBox="0 0 25 23" fill="none">
            <path
              d="M2.5 22.5c-.69 0-1.28-.24-1.77-.73A2.41 2.41 0 0 1 0 20V2.5C0 1.81.24 1.22.73.73.98.24 1.81 0 2.5 0h20c.69 0 1.28.24 1.77.73.49.5.73 1.08.73 1.77V20c0 .69-.24 1.28-.73 1.77-.5.49-1.08.73-1.77.73h-20Zm0-2.5h20V2.5h-20V20Zm1.25-2.5H10V15H3.75v2.5ZM15.69 15l6.19-6.19-1.79-1.78-4.4 4.44-1.78-1.78-1.75 1.78L15.69 15ZM3.75 12.5H10V10H3.75v2.5Zm0-5H10V5H3.75v2.5Z"
              fill="#71E000"
            />
          </svg>
          <h2 className="font-display text-3xl font-bold tracking-[0.05em] text-white md:text-4xl">
            MISSION BRIEFING
          </h2>
        </motion.div>

        {/* ============ CARDS GRID ============ */}
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {/* Card 1 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
            whileHover={{ y: -6, borderColor: "rgba(113, 224, 0, 0.8)" }}
            className="card relative p-6 transition-all duration-300"
          >
            <span className="hud-note absolute right-2 top-2">REG.01</span>
            <p className="font-mono text-xs tracking-wide text-zinc-300">COMBAT PROTOCOL</p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-[0.05em] text-white">
              RULES &amp; REGULATIONS
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Know the match format, weapon restrictions, map rules, technical procedures,
              and fair-play requirements before entering the server.
            </p>
            <motion.div whileHover={{ x: 4 }} className="inline-block mt-4">
              <Link href="/rules" className="font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-600">
                View rulebook →
              </Link>
            </motion.div>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            whileHover={{ y: -6, borderColor: "rgba(113, 224, 0, 0.8)" }}
            className="card relative p-6 transition-all duration-300"
          >
            <span className="hud-note absolute right-2 top-2">MAP.02</span>
            <p className="font-mono text-xs tracking-wide text-zinc-300">THEATRE OF WAR</p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-[0.05em] text-white">
              MAP POOL
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {mapPool.map((m) => (
                <motion.span
                  key={m}
                  whileHover={{ scale: 1.08, borderColor: "#71E000" }}
                  className="border border-night-700 bg-night-850 px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-zinc-300 transition-colors"
                >
                  {m}
                </motion.span>
              ))}
            </div>
            <p className="mt-3 font-mono text-[11px] text-zinc-500">
              5v5 S&D // PROMOD LIVE
            </p>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.3 }}
            whileHover={{ y: -6, borderColor: "rgba(113, 224, 0, 0.8)" }}
            className="card relative p-6 transition-all duration-300"
          >
            <span className="hud-note absolute right-2 top-2">SQD.03</span>
            <p className="font-mono text-xs tracking-wide text-zinc-300">TEAM COMPOSITION</p>
            <h3 className="mt-1 font-display text-2xl font-bold tracking-[0.05em] text-white">
              5 PLAYERS
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-zinc-400">
              Each team fields exactly 5 players per match. Only registered team members may
              compete, and substitutions are not allowed during an active match.
            </p>
            <motion.div whileHover={{ x: 4 }} className="inline-block mt-4">
              <Link href="/register" className="font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-600">
                Register squad →
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* ============ SCORE SCREENSHOTS / LEADERBOARD HIGHLIGHTS ============ */}
      {leaderboardImages && leaderboardImages.length > 0 && (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between border-b border-night-700 pb-4"
          >
            <div>
              <h2 className="font-display text-3xl font-bold tracking-[0.05em] text-white">
                LEADERBOARD &amp; SCORES
              </h2>
              <p className="mt-1 text-xs text-zinc-400 font-mono">
                Official tournament scoreboard captures verified by admins
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-500"
            >
              Full Leaderboard →
            </Link>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {leaderboardImages.slice(0, 6).map((img, idx) => (
              <motion.div
                key={img.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="group card overflow-hidden border-night-700 transition-all hover:border-ember-500/50"
              >
                <Link href="/leaderboard" className="block">
                  <div className="relative aspect-video w-full overflow-hidden bg-night-900">
                    <img
                      src={img.image_url}
                      alt={img.title ?? "Match Score"}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-sm text-white group-hover:text-ember-400 transition-colors truncate">
                      {img.title || "Match Score Screenshot"}
                    </h3>
                    <p className="mt-1 font-mono text-[10px] text-zinc-500">
                      Uploaded {new Date(img.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                    </p>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* ============ INTEL FEED ============ */}
      {announcements.length > 0 && (
        <div className="space-y-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center justify-between border-b border-night-700 pb-4"
          >
            <h2 className="font-display text-3xl font-bold tracking-[0.05em] text-white">
              INTEL FEED
            </h2>
            <Link href="/announcements" className="font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-600">
              View all →
            </Link>
          </motion.div>
          <div className="grid gap-4 md:grid-cols-3">
            {announcements.map((a, index) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{ y: -4, borderColor: "rgba(113, 224, 0, 0.7)" }}
                className="card p-5 transition-all duration-300"
              >
                <div className="font-mono text-[10px] text-zinc-500">
                  {new Date(a.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                </div>
                <h3 className="mt-1 font-display text-xl font-bold text-white">{a.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-zinc-400">{a.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
