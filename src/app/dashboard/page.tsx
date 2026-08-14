"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import MatchCard from "@/components/MatchCard";
import ScoreSubmitForm from "@/components/ScoreSubmitForm";
import StatusBadge from "@/components/StatusBadge";
import TeamMark from "@/components/TeamMark";
import { useSocketEvents } from "@/hooks/useSocket";
import type { Match, Player, Team } from "@/lib/types";

export default function CaptainDashboard() {
  const { status: authStatus } = useSession();
  const [team, setTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/me/team");
    if (!res.ok) return setLoading(false);
    const json = await res.json();
    setTeam(json.team);
    setPlayers(json.players ?? []);
    setMatches(json.matches ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated") load();
    if (authStatus === "unauthenticated") setLoading(false);
  }, [authStatus, load]);

  useSocketEvents(
    ["match:finished", "match:disputed", "match:score_submitted", "match:live", "bracket:updated", "team:approved"],
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
    <div className="site-gutter mx-auto max-w-7xl py-10">
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
        <p className="mt-4 border border-amber-500/30 bg-amber-500/10 px-4 py-3 font-mono text-xs text-amber-300">
          Your registration is awaiting admin approval. You&apos;ll be unlocked for fixtures once approved.
        </p>
      )}
      {team.status === "rejected" && (
        <p className="mt-4 border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-xs text-red-300">
          Your registration was rejected. Contact the organizers if you believe this is a mistake.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
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
    </div>
  );
}
