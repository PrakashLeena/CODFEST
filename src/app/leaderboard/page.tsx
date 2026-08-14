"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import { useSocketEvents } from "@/hooks/useSocket";

interface LeaderboardImage {
  id: string;
  title: string | null;
  image_url: string;
  created_at: string;
}

export default function LeaderboardPage() {
  const [images, setImages] = useState<LeaderboardImage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/leaderboard-image");
      const json = await res.json();
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

  useSocketEvents(["leaderboard:updated"], () => {
    load();
  });

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10 space-y-10">
      {/* Header */}
      <div className="border-b border-night-700 pb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">TOURNAMENT LEADERBOARD</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-400">
            OFFICIAL MATCH SCORES &amp; RESULTS
          </p>
        </div>
        {images.length > 0 && (
          <span className="rounded border border-ember-500/40 bg-ember-600/10 px-3 py-1 font-mono text-xs text-ember-400">
            {images.length} {images.length === 1 ? "SCOREBOARD" : "SCOREBOARDS"} PUBLISHED
          </span>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="py-20 text-center text-sm font-mono text-zinc-500 animate-pulse">
          Loading scoreboard results…
        </div>
      )}

      {/* Empty State */}
      {!loading && images.length === 0 && (
        <div className="card p-12 text-center space-y-3">
          <div className="text-4xl">🏆</div>
          <h2 className="font-display text-xl font-bold uppercase text-white">
            No Scoreboards Uploaded Yet
          </h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Tournament administrators will upload official match score screenshots here as matches conclude.
          </p>
        </div>
      )}

      {/* Big Full-Size Scoreboard Showcase */}
      {!loading && images.length > 0 && (
        <div className="space-y-10">
          {images.map((img, index) => (
            <article
              key={img.id}
              className="card overflow-hidden border-night-700 bg-night-900 shadow-2xl transition-all duration-300 hover:border-night-600"
            >
              {/* Header bar of each scoreboard */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-night-700 bg-night-800/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-ember-600 font-mono text-xs font-bold text-white">
                    #{index + 1}
                  </span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-white">
                      {img.title || `Match Result #${index + 1}`}
                    </h2>
                    <p className="font-mono text-[11px] text-zinc-400">
                      Verified &amp; Published {new Date(img.created_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>

                <a
                  href={img.image_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost !py-1.5 !px-3 font-mono text-xs"
                >
                  Open Original ↗
                </a>
              </div>

              {/* Big High-Res Image Display */}
              <div className="relative overflow-hidden bg-black/90 flex items-center justify-center p-2 sm:p-4 min-h-[360px] md:min-h-[500px]">
                <img
                  src={img.image_url}
                  alt={img.title ?? "Tournament Scoreboard"}
                  className="max-h-[85vh] w-full object-contain"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
