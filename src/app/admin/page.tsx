"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import TeamMark from "@/components/TeamMark";
import { getSocket, useSocketEvents } from "@/hooks/useSocket";
import { ROUND_NAMES, type Match } from "@/lib/types";
import { getPusherClient } from "@/lib/pusher";

const TABS = [
  "Registrations",
  "Fixtures",
  "Live Server",
  "Live Score & Killfeed",
  "Disputes",
  "Announcements",
  "Audit log",
  "Teams Control",
] as const;

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Registrations");
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.role === "admin") getSocket().emit("join:admin");
  }, [session]);

  useSocketEvents(["admin:dispute_alert", "team:registered"], (event) => {
    setAlert(
      event === "admin:dispute_alert"
        ? "A match was just disputed — check the Disputes tab."
        : "A new team just registered — check Registrations."
    );
  });

  if (status === "loading") return <p className="mt-20 text-center text-zinc-500">Loading…</p>;
  if (session?.user?.role !== "admin") {
    return (
      <div className="site-gutter mx-auto max-w-md py-20 text-center">
        <h1 className="section-title">Admins only</h1>
        <p className="mt-3 text-zinc-400">This area requires an administrator account.</p>
        <Link href="/login" className="btn-primary mt-6">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-night-700 pb-4">
        <div>
          <h1 className="section-title">HQ Command</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-400">
            SYS.ADMIN // DEPT. STATUS: NOMINAL
          </p>
        </div>
        <span className="border border-ember-400 bg-ember-600/10 px-3 py-1 font-mono text-xs text-ember-400">
          CLEARANCE: ADMIN
        </span>
      </div>

      {alert && (
        <div className="mt-4 flex items-center justify-between border border-purple-500/40 bg-purple-500/10 px-4 py-3 font-mono text-xs text-purple-200">
          {alert}
          <button onClick={() => setAlert(null)} className="ml-4 text-purple-300 hover:text-white">✕</button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={tab === t ? "tab-btn-active" : "tab-btn"}>
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === "Registrations"         && <RegistrationsPanel />}
        {tab === "Fixtures"              && <FixturesPanel />}
        {tab === "Live Server"           && <LiveServerPanel />}
        {tab === "Live Score & Killfeed" && <LiveScoreAndKillfeedPanel />}
        {tab === "Disputes"              && <DisputesPanel />}
        {tab === "Announcements"         && <AnnouncementsPanel />}
        {tab === "Audit log"             && <AuditPanel />}
        {tab === "Teams Control"         && <TeamsControlPanel />}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function RegistrationsPanel() {
  const [teams, setTeams] = useState<any[]>([]);
  const load = useCallback(() => {
    fetch("/api/admin/teams").then((r) => r.json()).then((j) => setTeams(j.teams ?? []));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, action: "approve" | "reject") {
    await fetch(`/api/teams/${id}/${action}`, { method: "PATCH" });
    load();
  }

  const pending = teams.filter((t) => t.status === "pending");
  const others = teams.filter((t) => t.status !== "pending");

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-lg font-bold uppercase text-white">
          Pending approval ({pending.length})
        </h2>
        {pending.length === 0 && <p className="mt-3 text-sm text-zinc-500">Nothing pending.</p>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {pending.map((t) => (
            <div key={t.id} className="card p-5">
              <div className="flex items-center justify-between">
                <TeamMark name={t.team_name} logoUrl={t.logo_url} size={40} />
                <StatusBadge status={t.status} />
              </div>
              <div className="mt-3 text-xs text-zinc-500">
                Captain: <span className="text-zinc-300">{t.captain?.name}</span> ({t.captain?.email})<br />
                Phone: {t.phone ?? "—"} · Discord: {t.discord || "—"}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Roster: {t.players?.map((p: any) => p.player_name).join(", ") || "—"}
              </div>
              <div className="mt-4 flex gap-2">
                <button className="btn-primary flex-1 !py-2 text-xs" onClick={() => act(t.id, "approve")}>Approve</button>
                <button className="btn-ghost flex-1 !py-2 text-xs !text-red-300 hover:!border-red-500" onClick={() => act(t.id, "reject")}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-display text-lg font-bold uppercase text-white">All teams</h2>
        <div className="card mt-4 divide-y divide-night-800">
          {others.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3">
              <TeamMark name={t.team_name} logoUrl={t.logo_url} size={28} />
              <div className="flex items-center gap-3">
                <StatusBadge status={t.status} />
                {t.status === "rejected" && (
                  <button className="font-mono text-xs font-bold uppercase text-ember-500 hover:text-ember-400" onClick={() => act(t.id, "approve")}>
                    Approve instead
                  </button>
                )}
              </div>
            </div>
          ))}
          {others.length === 0 && <p className="px-4 py-6 text-sm text-zinc-500">No processed teams yet.</p>}
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FixturesPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/matches").then((r) => r.json()).then((j) => setMatches(j.matches ?? []));
  }, []);
  useEffect(load, [load]);
  useSocketEvents(["bracket:updated", "match:finished", "match:live"], () => load());

  async function generate() {
    if (!confirm("Regenerating wipes ALL existing fixtures and results. Continue?")) return;
    setBusy(true);
    const res = await fetch("/api/bracket/generate", { method: "POST" });
    const json = await res.json();
    setMsg(res.ok ? `Bracket generated with ${json.bracket.length} first-round matches.` : json.error);
    setBusy(false);
    load();
  }

  async function start(id: string) {
    const res = await fetch(`/api/matches/${id}/start`, { method: "PATCH" });
    if (!res.ok) setMsg((await res.json()).error);
    load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate bracket from approved teams"}
        </button>
        {msg && <span className="text-sm text-zinc-400">{msg}</span>}
      </div>

      <div className="card mt-6 divide-y divide-night-800">
        {matches.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="w-28 text-xs font-bold uppercase text-zinc-500">
                {ROUND_NAMES[m.round] ?? `Round ${m.round}`}
              </span>
              <span className="text-zinc-200">{m.team1?.team_name ?? "TBD"}</span>
              <span className="text-zinc-600">vs</span>
              <span className="text-zinc-200">{m.team2?.team_name ?? "TBD"}</span>
              {m.status === "finished" && (
                <span className="font-display font-bold text-ember-400">
                  {m.final_score1}–{m.final_score2}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={m.status} />
              {m.status === "scheduled" && m.team1_id && m.team2_id && (
                <button className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => start(m.id)}>
                  Start match
                </button>
              )}
            </div>
          </div>
        ))}
        {matches.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">
            No fixtures yet — generate the bracket once teams are approved.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LIVE SERVER — embedded RCON player view (admin only)                */
/* ------------------------------------------------------------------ */

interface RconPlayer {
  slot:   number;
  name:   string;
  score:  number;
  ping:   number;
  team:   string;
  kills:  number;
  deaths: number;
}

interface ServerInfo {
  online:        boolean;
  map?:          string;
  hostname?:     string;
  allies_score?: number;
  axis_score?:   number;
  players?:      RconPlayer[];
  error?:        string;
}

function LiveServerPanel() {
  const [info, setInfo] = useState<ServerInfo | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/rcon?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) setInfo(await res.json());
      } catch (err) {
        console.error("Error fetching live server info:", err);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 2500);
    return () => clearInterval(interval);
  }, []);

  const allies = info?.players?.filter((p) => p.team === "allies") || [];
  const axis   = info?.players?.filter((p) => p.team === "axis")   || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl">
        <div>
          <h2 className="text-2xl font-extrabold tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
            MAIN SERVER (S&amp;D)
          </h2>
          {info?.online ? (
            <p className="text-gray-400 font-mono mt-1">
              Map: <span className="text-gray-200 font-bold">{info.map}</span>
            </p>
          ) : (
            <p className="text-red-500 font-mono mt-1">Status: Offline / Unreachable</p>
          )}
        </div>

        {info?.online && (
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <span className="text-gray-500 text-xs font-bold tracking-widest uppercase">Allies</span>
              <span className="text-5xl font-black text-blue-500">{info.allies_score}</span>
            </div>
            <span className="text-gray-600 font-bold text-xl">VS</span>
            <div className="flex flex-col items-center">
              <span className="text-gray-500 text-xs font-bold tracking-widest uppercase">Axis</span>
              <span className="text-5xl font-black text-red-500">{info.axis_score}</span>
            </div>
          </div>
        )}

        <Link href="/live-server" target="_blank" className="btn-primary !px-4 !py-2 !text-xs whitespace-nowrap">
          Open Full Page ↗
        </Link>
      </div>

      {/* Player grids */}
      {info?.online && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Allies */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden shadow-xl">
            <div className="bg-blue-900/20 border-b border-blue-900/50 p-4">
              <h3 className="text-lg font-bold text-blue-400 text-center uppercase tracking-widest">Team 1 (Allies)</h3>
            </div>
            <div className="grid grid-cols-12 p-3 bg-gray-800/50 text-xs font-mono text-gray-400 font-bold">
              <div className="col-span-4">PLAYER</div>
              <div className="col-span-2 text-center">K</div>
              <div className="col-span-2 text-center">D</div>
              <div className="col-span-2 text-center">SCORE</div>
              <div className="col-span-2 text-right">PING</div>
            </div>
            <div className="divide-y divide-gray-800/60 font-mono text-sm">
              {allies.length === 0
                ? <p className="text-center p-6 text-gray-500 italic">No players</p>
                : allies.map((p) => (
                    <div key={p.slot} className="grid grid-cols-12 p-4 items-center hover:bg-gray-800/30 transition-colors">
                      <div className="col-span-4 font-bold truncate">{p.name}</div>
                      <div className="col-span-2 text-center text-green-400">{p.kills}</div>
                      <div className="col-span-2 text-center text-red-400">{p.deaths}</div>
                      <div className="col-span-2 text-center font-bold text-yellow-400">{p.score}</div>
                      <div className="col-span-2 text-right text-gray-400">{p.ping}</div>
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Axis */}
          <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden shadow-xl">
            <div className="bg-red-900/20 border-b border-red-900/50 p-4">
              <h3 className="text-lg font-bold text-red-400 text-center uppercase tracking-widest">Team 2 (Axis)</h3>
            </div>
            <div className="grid grid-cols-12 p-3 bg-gray-800/50 text-xs font-mono text-gray-400 font-bold">
              <div className="col-span-4">PLAYER</div>
              <div className="col-span-2 text-center">K</div>
              <div className="col-span-2 text-center">D</div>
              <div className="col-span-2 text-center">SCORE</div>
              <div className="col-span-2 text-right">PING</div>
            </div>
            <div className="divide-y divide-gray-800/60 font-mono text-sm">
              {axis.length === 0
                ? <p className="text-center p-6 text-gray-500 italic">No players</p>
                : axis.map((p) => (
                    <div key={p.slot} className="grid grid-cols-12 p-4 items-center hover:bg-gray-800/30 transition-colors">
                      <div className="col-span-4 font-bold truncate">{p.name}</div>
                      <div className="col-span-2 text-center text-green-400">{p.kills}</div>
                      <div className="col-span-2 text-center text-red-400">{p.deaths}</div>
                      <div className="col-span-2 text-center font-bold text-yellow-400">{p.score}</div>
                      <div className="col-span-2 text-right text-gray-400">{p.ping}</div>
                    </div>
                  ))
              }
            </div>
          </div>
        </div>
      )}

      {!info && (
        <p className="py-8 text-center text-sm text-zinc-500 animate-pulse">Fetching server info…</p>
      )}
      {info && !info.online && (
        <div className="rounded-xl border border-red-900/40 bg-red-900/10 p-6 text-center font-mono text-sm text-red-400">
          Server is offline or unreachable.{info.error && <span className="block mt-1 text-xs text-red-600">{info.error}</span>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LIVE SCORE & KILLFEED — merged panel                                */
/* ------------------------------------------------------------------ */

interface KillEvent   { attacker: string; victim: string; weapon: string; time: string; }
interface PlayerRow   { name: string; kills: number; deaths: number; team: "allies" | "axis" | "free"; kd: string | number; }
interface ScoreUpdate { scoreboard: PlayerRow[]; map: string; status: string; time: string; }
interface MatchStatusEvt { status: "starting" | "live" | "ended"; map: string; scoreboard?: PlayerRow[]; time: string; }

const STATUS_LABEL: Record<string, string> = { idle: "WAITING", starting: "STARTING", live: "LIVE", ended: "GAME OVER" };
const STATUS_COLOR: Record<string, string> = {
  idle:     "text-gray-400 border-gray-600 bg-gray-800/50",
  starting: "text-yellow-400 border-yellow-500/40 bg-yellow-900/20",
  live:     "text-green-400 border-green-500/40 bg-green-900/20",
  ended:    "text-red-400 border-red-500/40 bg-red-900/20",
};
const TEAM_COLOR: Record<string, string> = { allies: "text-blue-400", axis: "text-red-400", free: "text-amber-400" };
const TEAM_BG:    Record<string, string> = {
  allies: "bg-blue-500/10 border-blue-500/20",
  axis:   "bg-red-500/10 border-red-500/20",
  free:   "bg-amber-500/10 border-amber-500/20",
};

function isTDM(scoreboard: PlayerRow[]): boolean {
  const teams = new Set(scoreboard.map((p) => p.team).filter((t) => t !== "free"));
  return teams.size >= 2;
}

function TeamScoreCard({ players, team }: { players: PlayerRow[]; team: "allies" | "axis" }) {
  const total = players.reduce((s, p) => s + p.kills, 0);
  const label = team === "allies" ? "🔵 ALLIES" : "🔴 AXIS";
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${TEAM_BG[team]}`}>
      <div className={`text-xs font-mono font-bold tracking-widest ${TEAM_COLOR[team]}`}>{label}</div>
      <div className={`text-5xl font-black tabular-nums ${TEAM_COLOR[team]}`}>{total}</div>
      <div className="text-xs text-gray-500 font-mono">total kills</div>
    </div>
  );
}

function LiveScoreAndKillfeedPanel() {
  /* ── Manual bracket score push ── */
  const [liveMatches, setLiveMatches] = useState<Match[]>([]);
  const [scores,      setScores]      = useState<Record<string, { s1: string; s2: string }>>({});
  const [busy,        setBusy]        = useState<Record<string, boolean>>({});
  const [feedback,    setFeedback]    = useState<Record<string, string>>({});

  const loadMatches = useCallback(() => {
    fetch("/api/matches?status=live")
      .then((r) => r.json())
      .then((j) => {
        const matches: Match[] = j.matches ?? [];
        setLiveMatches(matches);
        setScores((prev) => {
          const next = { ...prev };
          matches.forEach((m: any) => {
            if (!next[m.id]) next[m.id] = {
              s1: m.live_score1 != null ? String(m.live_score1) : "",
              s2: m.live_score2 != null ? String(m.live_score2) : "",
            };
          });
          return next;
        });
      });
  }, []);

  useEffect(loadMatches, [loadMatches]);
  useSocketEvents(["match:live", "match:finished"], () => loadMatches());

  async function push(matchId: string) {
    const s = scores[matchId];
    if (!s) return;
    const score1 = parseInt(s.s1, 10);
    const score2 = parseInt(s.s2, 10);
    if (isNaN(score1) || isNaN(score2) || score1 < 0 || score2 < 0) {
      setFeedback((p) => ({ ...p, [matchId]: "Enter valid non-negative scores." }));
      return;
    }
    setBusy((p) => ({ ...p, [matchId]: true }));
    const res  = await fetch(`/api/matches/${matchId}/live-score`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score1, score2 }),
    });
    const json = await res.json();
    setBusy((p)     => ({ ...p, [matchId]: false }));
    setFeedback((p) => ({ ...p, [matchId]: res.ok ? `✓ Pushed ${score1}–${score2} live!` : json.error ?? "Failed" }));
  }

  /* ── Pusher real-time scoreboard + killfeed ── */
  const [scoreboard,  setScoreboard]  = useState<PlayerRow[]>([]);
  const [killFeed,    setKillFeed]    = useState<KillEvent[]>([]);
  const [matchStatus, setMatchStatus] = useState<"idle" | "starting" | "live" | "ended">("idle");
  const [mapName,     setMapName]     = useState<string>("—");
  const [lastUpdate,  setLastUpdate]  = useState<string>("");
  const [connected,   setConnected]   = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pusher  = getPusherClient();
    const channel = pusher.subscribe("cod4-server");
    pusher.connection.bind("connected",    () => setConnected(true));
    pusher.connection.bind("disconnected", () => setConnected(false));
    pusher.connection.bind("error",        () => setConnected(false));
    channel.bind("score-update", (data: ScoreUpdate) => {
      setScoreboard(data.scoreboard ?? []);
      setMapName(data.map ?? "—");
      setMatchStatus((data.status as any) ?? "live");
      setLastUpdate(data.time ?? "");
    });
    channel.bind("kill-event", (data: KillEvent) => {
      setKillFeed((prev) => [data, ...prev.slice(0, 29)]);
    });
    channel.bind("match-status", (data: MatchStatusEvt) => {
      setMatchStatus(data.status);
      setMapName(data.map ?? "—");
      if (data.scoreboard) setScoreboard(data.scoreboard);
      if (data.status === "starting") { setScoreboard([]); setKillFeed([]); }
    });
    setTimeout(() => { if (pusher.connection.state === "connected") setConnected(true); }, 1000);
    return () => { pusher.unsubscribe("cod4-server"); };
  }, []);

  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = 0; }, [killFeed]);

  const tdm    = isTDM(scoreboard);
  const allies = scoreboard.filter((p) => p.team === "allies");
  const axis   = scoreboard.filter((p) => p.team === "axis");

  return (
    <div className="space-y-8">

      {/* ── Section A: Manual bracket score push ── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold uppercase text-white">Bracket Live Score Push</h2>
          <Link href="/livescore" target="_blank" className="btn-primary !px-4 !py-2 !text-xs whitespace-nowrap">
            Open Live Score ↗
          </Link>
        </div>

        <div className="mb-4 border border-ember-400/30 bg-ember-600/10 px-4 py-3 font-mono text-xs text-ember-300">
          🖥️ SERVER LAPTOP — type the current in-game score and hit <strong>Push</strong>.
          All connected browsers update instantly via Socket.IO.
        </div>

        {liveMatches.length === 0 && (
          <p className="py-6 text-center text-sm text-zinc-500">
            No live matches right now. Start a match in the Fixtures tab first.
          </p>
        )}

        <div className="space-y-4">
          {liveMatches.map((m) => {
            const isBusy = busy[m.id] ?? false;
            const fb     = feedback[m.id];
            const s      = scores[m.id] ?? { s1: "", s2: "" };
            return (
              <div key={m.id} className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                      {ROUND_NAMES[m.round] ?? `Round ${m.round}`}
                    </span>
                    <h3 className="mt-0.5 font-display text-lg font-bold text-white">
                      {m.team1?.team_name ?? "TBD"}
                      <span className="mx-2 text-zinc-500">vs</span>
                      {m.team2?.team_name ?? "TBD"}
                    </h3>
                  </div>
                  <span className="animate-pulse rounded bg-green-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase text-green-400">
                    ● LIVE
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap items-end gap-4">
                  <div>
                    <label className="label">{m.team1?.team_name ?? "Team 1"}</label>
                    <input
                      id={`s1-${m.id}`} type="number" min={0}
                      className="input !w-24 text-center text-xl font-bold"
                      value={s.s1}
                      onChange={(e) => setScores((p) => ({ ...p, [m.id]: { ...p[m.id], s1: e.target.value } }))}
                      placeholder="0" onKeyDown={(e) => e.key === "Enter" && push(m.id)}
                    />
                  </div>
                  <span className="mb-2 text-xl font-bold text-zinc-600">–</span>
                  <div>
                    <label className="label">{m.team2?.team_name ?? "Team 2"}</label>
                    <input
                      id={`s2-${m.id}`} type="number" min={0}
                      className="input !w-24 text-center text-xl font-bold"
                      value={s.s2}
                      onChange={(e) => setScores((p) => ({ ...p, [m.id]: { ...p[m.id], s2: e.target.value } }))}
                      placeholder="0" onKeyDown={(e) => e.key === "Enter" && push(m.id)}
                    />
                  </div>
                  <button className="btn-primary !py-2.5" onClick={() => push(m.id)} disabled={isBusy}>
                    {isBusy ? "Pushing…" : "Push live score"}
                  </button>
                  {fb && (
                    <span className={`font-mono text-xs ${fb.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>{fb}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <hr className="border-night-700" />

      {/* ── Section B: Pusher real-time scoreboard + killfeed ── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-bold uppercase text-white">Real-time Scoreboard &amp; Kill Feed</h2>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-mono font-bold tracking-widest transition-all duration-500 ${STATUS_COLOR[matchStatus]}`}>
              {matchStatus === "live"     && <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />}
              {matchStatus === "starting" && <span className="h-2 w-2 animate-bounce rounded-full bg-yellow-400" />}
              {STATUS_LABEL[matchStatus] ?? "UNKNOWN"}
            </span>
            <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-mono transition-colors ${connected ? "border-emerald-500/30 bg-emerald-900/20 text-emerald-400" : "border-gray-700 bg-gray-800/50 text-gray-500"}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />
              {connected ? "CONNECTED" : "CONNECTING…"}
            </span>
          </div>
        </div>

        {/* Map info bar */}
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-lg border border-gray-800 bg-gray-900/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500 tracking-widest">MAP</span>
            <span className="font-mono text-sm font-bold text-amber-400 uppercase">{mapName}</span>
          </div>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500 tracking-widest">MODE</span>
            <span className="font-mono text-sm font-semibold text-gray-300">{tdm ? "TDM" : "FFA"}</span>
          </div>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-500 tracking-widest">PLAYERS</span>
            <span className="font-mono text-sm font-semibold text-gray-300">{scoreboard.length}</span>
          </div>
          {lastUpdate && (
            <>
              <div className="h-4 w-px bg-gray-700 ml-auto" />
              <span className="font-mono text-xs text-gray-600">Updated {lastUpdate}</span>
            </>
          )}
        </div>

        {/* TDM team score cards */}
        {tdm && (
          <div className="mb-5 grid grid-cols-2 gap-4">
            <TeamScoreCard players={allies} team="allies" />
            <div className="flex items-center justify-center text-3xl font-black text-gray-600">VS</div>
            <TeamScoreCard players={axis}   team="axis" />
          </div>
        )}

        {/* Scoreboard + Kill Feed */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Scoreboard (2/3) */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden shadow-2xl shadow-black/40">
              <div className="grid grid-cols-12 border-b border-gray-800 bg-gray-800/60 px-4 py-2.5 font-mono text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                <span className="col-span-1 text-center">#</span>
                <span className="col-span-5">PLAYER</span>
                <span className="col-span-2 text-center text-green-500">💀 KILLS</span>
                <span className="col-span-2 text-center text-red-500">💀 DEATHS</span>
                <span className="col-span-2 text-center text-yellow-500">K/D</span>
              </div>
              {scoreboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <div className="text-4xl opacity-30">🎮</div>
                  <p className="font-mono text-sm text-gray-600">Waiting for match data…</p>
                  <p className="font-mono text-xs text-gray-700">Start CoD4, then restart <code className="text-gray-500">node pusher.js</code></p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/50">
                  {scoreboard.map((player, idx) => (
                    <div
                      key={player.name}
                      className={`group grid grid-cols-12 items-center px-4 py-3 transition-all duration-200 hover:bg-gray-800/40 ${idx === 0 ? "bg-amber-500/5" : ""}`}
                    >
                      <div className="col-span-1 text-center">
                        {idx === 0 ? <span className="text-lg">🥇</span>
                          : idx === 1 ? <span className="text-lg">🥈</span>
                          : idx === 2 ? <span className="text-lg">🥉</span>
                          : <span className="font-mono text-xs text-gray-600">{idx + 1}</span>}
                      </div>
                      <div className="col-span-5 flex items-center gap-2 min-w-0">
                        <div className={`h-2 w-2 flex-shrink-0 rounded-full ${player.team === "allies" ? "bg-blue-500" : player.team === "axis" ? "bg-red-500" : "bg-amber-500"}`} />
                        <span className={`truncate font-mono text-sm font-bold ${TEAM_COLOR[player.team] ?? "text-white"}`}>{player.name}</span>
                        {tdm && (
                          <span className={`hidden sm:inline-block flex-shrink-0 rounded px-1 py-0.5 font-mono text-[9px] font-bold uppercase ${player.team === "allies" ? "bg-blue-900/50 text-blue-400" : "bg-red-900/50 text-red-400"}`}>
                            {player.team}
                          </span>
                        )}
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`font-mono text-lg font-black tabular-nums ${idx === 0 ? "text-amber-400" : "text-green-400"}`}>{player.kills}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className="font-mono text-sm font-bold tabular-nums text-red-400">{player.deaths}</span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`font-mono text-sm font-bold tabular-nums ${Number(player.kd) >= 2 ? "text-amber-400" : Number(player.kd) >= 1 ? "text-gray-300" : "text-gray-500"}`}>{player.kd}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Kill Feed (1/3) */}
          <div className="lg:col-span-1">
            <div className="rounded-xl border border-gray-800 bg-gray-900/80 overflow-hidden shadow-2xl shadow-black/40 flex flex-col h-full">
              <div className="border-b border-gray-800 bg-gray-800/60 px-4 py-2.5">
                <h3 className="font-mono text-[10px] font-bold tracking-widest text-gray-500 uppercase">🔫 Kill Feed</h3>
              </div>
              <div ref={feedRef} className="flex-1 overflow-y-auto divide-y divide-gray-800/40 max-h-[600px]">
                {killFeed.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-12 text-center px-4">
                    <div className="text-3xl opacity-20">⚔️</div>
                    <p className="font-mono text-xs text-gray-600">No kills yet</p>
                  </div>
                ) : (
                  killFeed.map((ev, idx) => (
                    <div
                      key={idx}
                      className={`px-4 py-3 transition-all duration-300 ${idx === 0 ? "bg-red-500/5 border-l-2 border-red-500" : "hover:bg-gray-800/30"}`}
                    >
                      <div className="flex items-center gap-1 font-mono text-xs">
                        <span className="font-bold text-green-400 truncate max-w-[80px]">{ev.attacker}</span>
                        <span className="text-red-500 flex-shrink-0">⚔</span>
                        <span className="font-bold text-red-400 truncate max-w-[80px]">{ev.victim}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <span className="font-mono text-[10px] text-gray-500">{ev.weapon}</span>
                        <span className="font-mono text-[9px] text-gray-600">{ev.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {killFeed.length > 0 && (
                <div className="border-t border-gray-800 px-4 py-2 bg-gray-900/60">
                  <span className="font-mono text-[10px] text-gray-600">{killFeed.length} recent kill{killFeed.length !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}


/* ------------------------------------------------------------------ */


function DisputesPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const load = useCallback(() => {
    fetch("/api/matches?status=disputed").then((r) => r.json()).then((j) => setMatches(j.matches ?? []));
  }, []);
  useEffect(load, [load]);
  useSocketEvents(["match:disputed", "match:finished"], () => load());

  return (
    <div className="space-y-6">
      {matches.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">No disputed matches. 🎉</p>
      )}
      {matches.map((m) => <DisputeCard key={m.id} match={m} onResolved={load} />)}
    </div>
  );
}

function DisputeCard({ match, onResolved }: { match: Match; onResolved: () => void }) {
  const [s1, setS1] = useState("");
  const [s2, setS2] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}/resolve`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ final_score1: Number(s1), final_score2: Number(s2), note }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Failed to resolve");
    onResolved();
  }

  const sides = [
    { label: match.team1?.team_name ?? "Team 1", sub: match.submission_team1 },
    { label: match.team2?.team_name ?? "Team 2", sub: match.submission_team2 },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-bold text-white">
          {sides[0].label} vs {sides[1].label}
          <span className="ml-3 text-xs font-semibold uppercase text-zinc-500">
            {ROUND_NAMES[match.round] ?? `Round ${match.round}`} · {match.map}
          </span>
        </h3>
        <StatusBadge status={match.status} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {sides.map((side, i) => (
          <div key={i} className="border border-night-700 bg-night-850 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {side.label} reported
            </div>
            {side.sub ? (
              <>
                <div className="mt-1 font-display text-2xl font-bold text-white">
                  {side.sub.score_own} – {side.sub.score_opponent}
                  <span className="ml-2 text-xs font-semibold text-zinc-500">(own – opponent)</span>
                </div>
                <a href={side.sub.screenshot_url} target="_blank" rel="noreferrer">
                  <img
                    src={side.sub.screenshot_url}
                    alt={`${side.label} proof`}
                    className="mt-3 max-h-56 w-full border border-night-700 object-contain"
                  />
                </a>
                <div className="mt-2 text-[11px] text-zinc-500">
                  Submitted {new Date(side.sub.submitted_at).toLocaleString("en-IN")}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-zinc-500">No submission received.</p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={resolve} className="mt-4 flex flex-wrap items-end gap-3">
        {error && <p className="w-full rounded bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
        <div>
          <label className="label">{sides[0].label}</label>
          <input className="input !w-24 text-center" type="number" min={0} required value={s1} onChange={(e) => setS1(e.target.value)} />
        </div>
        <div>
          <label className="label">{sides[1].label}</label>
          <input className="input !w-24 text-center" type="number" min={0} required value={s2} onChange={(e) => setS2(e.target.value)} />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label">Resolution note (goes to audit log)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Team B screenshot matches demo" />
        </div>
        <button className="btn-primary !py-2.5" disabled={busy}>
          {busy ? "Resolving…" : "Set final score"}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AnnouncementsPanel() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg("Announcement published — every open tab just got it live.");
      setTitle("");
      setBody("");
    } else setMsg((await res.json()).error);
  }

  return (
    <form onSubmit={post} className="card max-w-2xl space-y-4 p-6">
      {msg && <p className="border border-night-700 bg-night-850 px-3 py-2 font-mono text-xs text-zinc-300">{msg}</p>}
      <div>
        <label className="label">Title</label>
        <input className="input" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="label">Body</label>
        <textarea className="input min-h-32" required maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <button className="btn-primary" disabled={busy}>{busy ? "Publishing…" : "Publish announcement"}</button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function AuditPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/audit-logs").then((r) => r.json()).then((j) => setLogs(j.logs ?? []));
  }, []);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-night-700 text-left text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Actor</th>
            <th className="px-4 py-3">Action</th>
            <th className="px-4 py-3">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id} className="border-b border-night-800 align-top last:border-0">
              <td className="whitespace-nowrap px-4 py-3 text-zinc-500">
                {new Date(l.created_at).toLocaleString("en-IN")}
              </td>
              <td className="px-4 py-3 text-zinc-300">{l.actor?.name ?? "system"}</td>
              <td className="px-4 py-3 font-semibold text-ember-400">{l.action}</td>
              <td className="px-4 py-3 text-xs text-zinc-500">
                <code className="break-all">{JSON.stringify(l.details)}</code>
              </td>
            </tr>
          ))}
          {logs.length === 0 && (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-zinc-500">No audit entries yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* TEAMS CONTROL — full management of all registered teams             */
/* ------------------------------------------------------------------ */

type TeamStatus = "pending" | "approved" | "rejected";

interface TeamFull {
  id:         string;
  team_name:  string;
  status:     TeamStatus;
  logo_url?:  string | null;
  phone?:     string | null;
  email?:     string | null;
  discord?:   string | null;
  whatsapp?:  string | null;
  created_at: string;
  captain?:   { name: string; email: string } | null;
  players?:   { id: string; player_name: string; game_id?: string; is_substitute?: boolean }[];
}

function TeamsControlPanel() {
  const [teams,      setTeams]      = useState<TeamFull[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterStat, setFilterStat] = useState<TeamStatus | "all">("all");
  const [editing,    setEditing]    = useState<TeamFull | null>(null);
  const [editName,   setEditName]   = useState("");
  const [editBusy,   setEditBusy]   = useState(false);
  const [editMsg,    setEditMsg]    = useState<string | null>(null);
  const [actionMsg,  setActionMsg]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/teams");
    const j   = await res.json();
    setTeams(j.teams ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    await fetch(`/api/teams/${id}/${action}`, { method: "PATCH" });
    setActionMsg(`Team ${action}d.`);
    setTimeout(() => setActionMsg(null), 3000);
    load();
  }

  async function saveEdit() {
    if (!editing || !editName.trim()) return;
    setEditBusy(true);
    setEditMsg(null);
    const res = await fetch(`/api/teams/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_name: editName.trim() }),
    });
    setEditBusy(false);
    if (res.ok) {
      setEditMsg("✓ Team name updated.");
      load();
      setTimeout(() => { setEditing(null); setEditMsg(null); }, 1500);
    } else {
      const j = await res.json();
      setEditMsg(j.error ?? "Failed to update.");
    }
  }

  const filtered = teams.filter((t) => {
    const matchStatus = filterStat === "all" || t.status === filterStat;
    const matchSearch = !search.trim() ||
      t.team_name.toLowerCase().includes(search.toLowerCase()) ||
      t.captain?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.captain?.email?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    all:      teams.length,
    pending:  teams.filter((t) => t.status === "pending").length,
    approved: teams.filter((t) => t.status === "approved").length,
    rejected: teams.filter((t) => t.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["all", "approved", "pending", "rejected"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStat(s)}
            className={`rounded-lg border px-4 py-3 text-left transition-all ${
              filterStat === s
                ? s === "approved" ? "border-green-500/50 bg-green-500/10"
                  : s === "pending"  ? "border-yellow-500/50 bg-yellow-500/10"
                  : s === "rejected" ? "border-red-500/50 bg-red-500/10"
                  : "border-ember-400/50 bg-ember-600/10"
                : "border-night-700 bg-night-850 hover:border-night-600"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{s}</div>
            <div className={`mt-1 text-3xl font-black tabular-nums ${
              filterStat === s
                ? s === "approved" ? "text-green-400"
                  : s === "pending"  ? "text-yellow-400"
                  : s === "rejected" ? "text-red-400"
                  : "text-ember-400"
                : "text-white"
            }`}>
              {counts[s]}
            </div>
          </button>
        ))}
      </div>

      {/* Search + action feedback */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="input flex-1 min-w-48"
          placeholder="Search by team name or captain…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {actionMsg && <span className="font-mono text-xs text-green-400">{actionMsg}</span>}
      </div>

      {loading && <p className="py-10 text-center text-sm text-zinc-500 animate-pulse">Loading teams…</p>}

      {/* Team list */}
      {!loading && (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">No teams match your filter.</p>
          )}
          {filtered.map((t) => (
            <div key={t.id} className="card divide-y divide-night-800">
              {/* Main row */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <TeamMark name={t.team_name} logoUrl={t.logo_url} size={36} />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-white truncate">{t.team_name}</div>
                    <div className="font-mono text-[11px] text-zinc-500 truncate">
                      Captain: {t.captain?.name ?? "—"} · {t.captain?.email ?? "—"}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={t.status} />

                  {t.status !== "approved" && (
                    <button
                      onClick={() => act(t.id, "approve")}
                      className="rounded border border-green-600/40 bg-green-600/10 px-3 py-1 font-mono text-xs font-bold text-green-400 hover:bg-green-600/20 transition-colors"
                    >
                      ✓ Approve
                    </button>
                  )}
                  {t.status !== "rejected" && (
                    <button
                      onClick={() => act(t.id, "reject")}
                      className="rounded border border-red-600/40 bg-red-600/10 px-3 py-1 font-mono text-xs font-bold text-red-400 hover:bg-red-600/20 transition-colors"
                    >
                      ✕ Reject
                    </button>
                  )}

                  <button
                    onClick={() => { setEditing(t); setEditName(t.team_name); setEditMsg(null); }}
                    className="rounded border border-night-600 bg-night-800 px-3 py-1 font-mono text-xs text-zinc-300 hover:border-night-500 hover:text-white transition-colors"
                  >
                    ✏ Edit
                  </button>
                </div>
              </div>

              {/* Inline edit form */}
              {editing?.id === t.id && (
                <div className="px-5 py-4 bg-night-850">
                  <label className="label mb-1">Team name</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="input flex-1 min-w-40"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    />
                    <button className="btn-primary !py-2 !px-4 text-xs" onClick={saveEdit} disabled={editBusy}>
                      {editBusy ? "Saving…" : "Save"}
                    </button>
                    <button
                      className="btn-ghost !py-2 !px-3 text-xs"
                      onClick={() => { setEditing(null); setEditMsg(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {editMsg && (
                    <p className={`mt-2 font-mono text-xs ${editMsg.startsWith("✓") ? "text-green-400" : "text-red-400"}`}>
                      {editMsg}
                    </p>
                  )}
                </div>
              )}

              {/* Roster */}
              {t.players && t.players.length > 0 && (
                <div className="px-5 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Roster</div>
                  <div className="flex flex-wrap gap-2">
                    {t.players.map((p) => (
                      <span
                        key={p.id}
                        className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${
                          p.is_substitute
                            ? "border border-zinc-700 bg-zinc-800 text-zinc-400"
                            : "border border-ember-500/30 bg-ember-600/10 text-ember-300"
                        }`}
                      >
                        {p.player_name}
                        {p.is_substitute && <span className="ml-1 text-zinc-600">(sub)</span>}
                        {p.game_id && <span className="ml-1 text-zinc-600">· {p.game_id}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact + meta */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3 text-[11px] text-zinc-500">
                {t.phone    && <span>📞 {t.phone}</span>}
                {t.email    && <span>✉ {t.email}</span>}
                {t.discord  && <span>🎮 {t.discord}</span>}
                {t.whatsapp && <span>💬 {t.whatsapp}</span>}
                <span className="ml-auto">Registered {new Date(t.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
