"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MatchCard from "@/components/MatchCard";
import ScoreSubmitForm from "@/components/ScoreSubmitForm";
import StatusBadge from "@/components/StatusBadge";
import TeamMark from "@/components/TeamMark";
import { useSocketEvents } from "@/hooks/useSocket";
import type { Match, Player, Team } from "@/lib/types";

interface LeaderboardImage {
  id: string;
  title: string | null;
  image_url: string;
  created_at: string;
}

export default function CaptainDashboard() {
  const { status: authStatus } = useSession();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [images, setImages] = useState<LeaderboardImage[]>([]);
  const [selectedImg, setSelectedImg] = useState<LeaderboardImage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [teamRes, leadRes] = await Promise.all([
        fetch("/api/me/team"),
        fetch("/api/admin/leaderboard-image"),
      ]);
      if (teamRes.ok) {
        const json = await teamRes.json();
        setTeam(json.team);
        setPlayers(json.players ?? []);
        setMatches(json.matches ?? []);
      }
      if (leadRes.ok) {
        const leadJson = await leadRes.json();
        setImages(leadJson.images ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") load();
    if (authStatus === "unauthenticated") setLoading(false);
  }, [authStatus, load]);

  useSocketEvents(
    [
      "match:finished",
      "match:disputed",
      "match:score_submitted",
      "match:live",
      "bracket:updated",
      "team:approved",
      "leaderboard:updated",
    ],
    () => load()
  );

  if (authStatus === "loading" || loading) {
    return <p className="mt-20 text-center text-zinc-500">Loading dashboard…</p>;
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="site-gutter mx-auto max-w-md py-20 text-center">
        <h1 className="section-title">Team dashboard</h1>
        <p className="mt-3 text-zinc-400">
          Access your team dashboard by verifying your captain email via OTP.
        </p>
        <Link href="/register" className="btn-primary mt-6">
          Captain OTP access
        </Link>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="site-gutter mx-auto max-w-md py-20 text-center">
        <h1 className="section-title">No team yet</h1>
        <p className="mt-3 text-zinc-400">You haven&apos;t registered a team with this account.</p>
        <Link href="/register" className="btn-primary mt-6">Register your team</Link>
      </div>
    );
  }

  const actionable = matches.filter((m) => ["live", "awaiting_scores", "disputed"].includes(m.status));
  const upcoming = matches.filter((m) => m.status === "scheduled");
  const finished = matches.filter((m) => m.status === "finished");

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10 space-y-8">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <TeamMark name={team.team_name} logoUrl={team.logo_url} size={52} />
        <div className="flex items-center gap-4">
          <StatusBadge status={team.status} />
          {team.status === "approved" && (
            <Link href={`/teams/${team.id}`} className="text-sm font-semibold text-ember-400 hover:text-ember-500">
              Public profile →
            </Link>
          )}
        </div>
      </div>

      {team.status === "pending" && (
        <p className="border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-300">
          Your registration is awaiting admin approval. You&apos;ll be unlocked for fixtures once approved.
        </p>
      )}
      {team.status === "rejected" && (
        <p className="border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-300">
          Your registration was rejected. Contact the organizers if you believe this is a mistake.
        </p>
      )}

      {/* Roster & Matches Section */}
      <div className="grid gap-8 lg:grid-cols-3">
        <div>
          <h2 className="section-title text-xl">Roster</h2>
          <div className="card mt-4 divide-y divide-night-800">
            {players.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-semibold text-zinc-200">{p.player_name}</div>
                  <div className="text-xs text-zinc-500">ID: {p.game_id}</div>
                </div>
                {p.is_substitute && (
                  <span className="border border-night-700 bg-night-600 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-400">Sub</span>
                )}
              </div>
            ))}
          </div>
          <div className="card mt-4 p-4 text-xs text-zinc-500">
            Points <span className="font-bold text-white">{team.points}</span> · W{" "}
            <span className="text-ember-500">{team.wins}</span> · L{" "}
            <span className="text-red-400">{team.losses}</span> · D{" "}
            <span className="text-zinc-300">{team.draws}</span>
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="section-title text-xl">Action required</h2>
          {actionable.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No matches waiting on you right now.</p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {actionable.map((m) => (
                <MatchCard key={m.id} match={m}>
                  <ScoreSubmitForm match={m} ownTeamId={team.id} onSubmitted={load} />
                </MatchCard>
              ))}
            </div>
          )}

          {upcoming.length > 0 && (
            <>
              <h2 className="section-title mt-8 text-xl">Upcoming</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {upcoming.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </>
          )}

          {finished.length > 0 && (
            <>
              <h2 className="section-title mt-8 text-xl">Completed</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {finished.map((m) => <MatchCard key={m.id} match={m} />)}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Official Scoreboard Screenshots */}
      {images.length > 0 && (
        <div className="space-y-4 pt-6 border-t border-night-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="section-title text-xl">Match Score Screenshots</h2>
              <p className="mt-0.5 text-xs text-zinc-400">
                Official tournament scoreboard captures uploaded by admins
              </p>
            </div>
            <Link
              href="/leaderboard"
              className="font-mono text-xs uppercase tracking-[0.1em] text-ember-400 hover:text-ember-500"
            >
              Full Leaderboard →
            </Link>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.slice(0, 6).map((img) => (
              <Link
                key={img.id}
                href="/leaderboard"
                className="group card overflow-hidden border-night-700 transition-all hover:border-ember-500/50 block"
              >
                <div className="relative aspect-video w-full overflow-hidden bg-night-900">
                  <img
                    src={img.image_url}
                    alt={img.title ?? "Score screenshot"}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-xs text-white truncate group-hover:text-ember-400">
                    {img.title || "Match Score Screenshot"}
                  </h3>
                  <p className="mt-0.5 font-mono text-[9px] text-zinc-500">
                    {new Date(img.created_at).toLocaleString("en-IN")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
