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
  const [selectedImg, setSelectedImg] = useState<LeaderboardImage | null>(null);

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
              className="card overflow-hidden border-night-700 bg-night-900 shadow-2xl transition-all duration-300 hover:border-ember-500/50"
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

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedImg(img)}
                    className="btn-primary !py-1.5 !px-3 font-mono text-xs flex items-center gap-1.5 shadow"
                  >
                    <span>⛶</span> Full Screen
                  </button>
                  <a
                    href={img.image_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost !py-1.5 !px-3 font-mono text-xs"
                  >
                    Original ↗
                  </a>
                </div>
              </div>

              {/* Big High-Res Image Display */}
              <div
                onClick={() => setSelectedImg(img)}
                className="group relative cursor-pointer overflow-hidden bg-black/90 flex items-center justify-center p-2 sm:p-4 min-h-[360px] md:min-h-[500px]"
              >
                <img
                  src={img.image_url}
                  alt={img.title ?? "Tournament Scoreboard"}
                  className="max-h-[80vh] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                />

                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 flex items-center justify-center">
                  <span className="rounded-full bg-ember-600/90 px-5 py-2.5 font-display text-sm font-bold text-white shadow-xl backdrop-blur-sm transform transition-transform group-hover:scale-105">
                    🔍 Click for Full Screen Mode
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {selectedImg && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-md"
          onClick={() => setSelectedImg(null)}
        >
          {/* Top Control Bar */}
          <div
            className="flex items-center justify-between border-b border-zinc-800 bg-black/80 px-6 py-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-display text-lg font-bold text-white">
                {selectedImg.title || "Match Scoreboard Screenshot"}
              </h3>
              <p className="font-mono text-xs text-zinc-400">
                Uploaded {new Date(selectedImg.created_at).toLocaleString("en-IN")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <a
                href={selectedImg.image_url}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Open Original File ↗
              </a>
              <button
                onClick={() => setSelectedImg(null)}
                className="rounded-lg bg-zinc-800 p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
                title="Close Fullscreen"
              >
                ✕ Close
              </button>
            </div>
          </div>

          {/* Full Screen Image Container */}
          <div
            className="flex-1 flex items-center justify-center p-4 overflow-auto"
            onClick={() => setSelectedImg(null)}
          >
            <img
              src={selectedImg.image_url}
              alt={selectedImg.title ?? "Scoreboard"}
              className="max-h-[90vh] max-w-[98vw] object-contain select-none shadow-2xl rounded"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
