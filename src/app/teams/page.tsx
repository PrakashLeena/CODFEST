"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import TeamMark from "@/components/TeamMark";

interface TeamRow {
  id: string;
  team_name: string;
  logo_url: string | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  captain: { name: string } | null;
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/teams", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setTeams((j.teams ?? []).filter((t: any) => t.team_name !== "DEMOO")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = teams.filter((t) =>
    t.team_name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="section-title">Verified Squads</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-500">
            // {teams.length} squads cleared for deployment
          </p>
        </div>
        <input
          className="input max-w-xs"
          placeholder="SEARCH_SQUADS"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="mt-10 text-center text-zinc-500">Loading teams…</p>
      ) : filtered.length === 0 ? (
        <p className="mt-10 text-center text-zinc-500">No teams found.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((t) => (
            <Link key={t.id} href={`/teams/${t.id}`} className="card p-5 transition hover:border-ember-600/50">
              <TeamMark name={t.team_name} logoUrl={t.logo_url} size={44} />
              <div className="mt-3 text-xs text-zinc-500">
                Leader: <span className="text-zinc-200 font-semibold">{t.captain?.name ?? "—"}</span>
              </div>
              <div className="mt-1 text-[11px] font-mono text-zinc-500">
                Squad: <span className="text-ember-400 font-bold">5 Members</span>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <span className="text-ember-500">{t.wins}W</span>
                <span className="text-red-400">{t.losses}L</span>
                <span className="text-zinc-400">{t.draws}D</span>
                <span className="ml-auto font-display font-bold text-white">{t.points} pts</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
