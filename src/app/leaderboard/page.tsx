"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import TeamMark from "@/components/TeamMark";
import { useSocketEvents } from "@/hooks/useSocket";

interface Row {
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
}

interface LeaderboardImage {
  id: string;
  title: string | null;
  image_url: string;
  created_at: string;
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [images, setImages] = useState<LeaderboardImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImg, setSelectedImg] = useState<LeaderboardImage | null>(null);

  const load = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      const json = await res.json();
      setRows(json.leaderboard ?? []);
      setImages(json.images ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useSocketEvents(["leaderboard:updated"], (_e, payload) => {
    if (payload?.leaderboard) {
      setRows(payload.leaderboard);
      setLoading(false);
    } else load();
  });

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10 space-y-10">
      {/* Header */}
      <div className="border-b border-night-700 pb-4">
        <h1 className="section-title">Tournament Leaderboard</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-400">
          Official Standings &amp; Scoreboard Screenshots
        </p>
      </div>

      {/* Official Scoreboard Screenshots (if uploaded by Admin) */}
      {images.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
                Match Score Screenshots
              </h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Official in-game score captures verified by tournament admins. Click on any screenshot to zoom.
              </p>
            </div>
            <span className="rounded border border-ember-500/30 bg-ember-600/10 px-2.5 py-1 font-mono text-xs text-ember-400">
              {images.length} {images.length === 1 ? "Screenshot" : "Screenshots"}
            </span>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <div
                key={img.id}
                onClick={() => setSelectedImg(img)}
                className="group card overflow-hidden cursor-pointer border-night-700 transition-all hover:border-ember-500/50 hover:shadow-lg hover:shadow-ember-500/10"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-night-900">
                  <img
                    src={img.image_url}
                    alt={img.title ?? "Score screenshot"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-night-950/80 via-transparent opacity-0 transition-opacity group-hover:opacity-100 flex items-center justify-center">
                    <span className="rounded-full bg-ember-600/90 px-3 py-1 text-xs font-bold text-white shadow">
                      🔍 Click to View Full Size
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-sm text-white group-hover:text-ember-400 transition-colors truncate">
                    {img.title || "Match Score Screenshot"}
                  </h3>
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">
                    Uploaded {new Date(img.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Standings Table */}
      <section className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-bold uppercase tracking-wide text-white">
            Team Standings
          </h2>
          <p className="mt-0.5 text-xs text-zinc-400">
            Points, win rate, and match records for all approved tournament teams.
          </p>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-night-700 bg-night-600 text-left font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-400">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3 text-center">PTS</th>
                <th className="px-4 py-3 text-center">W</th>
                <th className="px-4 py-3 text-center">L</th>
                <th className="px-4 py-3 text-center">D</th>
                <th className="px-4 py-3 text-center">Win rate</th>
                <th className="px-4 py-3 text-center">Maps (W–L)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500">
                    No approved teams yet.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-night-800 font-mono last:border-0 hover:bg-night-850"
                  >
                    <td
                      className={`px-4 py-3 font-bold ${
                        r.rank <= 3 ? "text-ember-600" : "text-zinc-500"
                      }`}
                    >
                      {String(r.rank).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <TeamMark name={r.team_name} logoUrl={r.logo_url} size={28} />
                    </td>
                    <td className="px-4 py-3 text-center text-lg font-bold text-white">
                      {r.points}
                    </td>
                    <td className="px-4 py-3 text-center text-ember-500">{r.wins}</td>
                    <td className="px-4 py-3 text-center text-red-400">{r.losses}</td>
                    <td className="px-4 py-3 text-center text-zinc-400">{r.draws}</td>
                    <td className="px-4 py-3 text-center text-zinc-300">{r.win_rate}%</td>
                    <td className="px-4 py-3 text-center text-zinc-400">
                      {r.maps_won}–{r.maps_lost}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Lightbox Modal for Full Image View */}
      {selectedImg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedImg(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-xl border border-night-700 bg-night-900 p-2 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-night-700 px-4 py-3">
              <div>
                <h3 className="font-bold text-white text-base">
                  {selectedImg.title || "Match Score Screenshot"}
                </h3>
                <p className="font-mono text-xs text-zinc-400">
                  {new Date(selectedImg.created_at).toLocaleString("en-IN")}
                </p>
              </div>
              <button
                onClick={() => setSelectedImg(null)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-night-800 hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="p-2">
              <img
                src={selectedImg.image_url}
                alt={selectedImg.title ?? "Score screenshot"}
                className="max-h-[75vh] w-full object-contain rounded"
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-2 border-t border-night-700">
              <a
                href={selectedImg.image_url}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost !py-1.5 !px-3 text-xs"
              >
                Open Original in New Tab ↗
              </a>
              <button
                onClick={() => setSelectedImg(null)}
                className="btn-primary !py-1.5 !px-4 text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
