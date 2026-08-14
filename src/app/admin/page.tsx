"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import StatusBadge from "@/components/StatusBadge";
import TeamMark from "@/components/TeamMark";
import { getSocket, useSocketEvents } from "@/hooks/useSocket";
import { ROUND_NAMES, MAP_POOL, type Match } from "@/lib/types";


const TABS = [
  "Registrations",
  "Fixtures",
  "Leaderboard Control",
  "Announcements",
  "Teams Control",
  "Audit log",
] as const;

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Registrations");
  const [alert, setAlert] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const downloadExcel = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/admin/export/registrations?t=${Date.now()}`);
      if (!res.ok) {
        let msg = "Export failed.";
        try {
          const j = await res.json();
          msg = j.error || j.details || msg;
        } catch {
          const t = await res.text();
          if (t) msg = t;
        }
        window.alert(`Export error (${res.status}): ${msg}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `CODFEST_Registrations_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      window.alert("Export failed: " + (e?.message || "Network error"));
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (session?.user?.role === "admin") getSocket().emit("join:admin");
  }, [session]);

  useSocketEvents(["team:registered", "leaderboard:updated"], (event) => {
    if (event === "team:registered") {
      setAlert("A new team just registered — check Registrations.");
    }
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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-night-700 pb-4">
        <div>
          <h1 className="section-title">HQ Command</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-zinc-400">
            SYS.ADMIN // DEPT. STATUS: NOMINAL
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadExcel}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-600/15 px-4 py-2 font-mono text-xs font-bold text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)] hover:bg-emerald-600/25 transition-all disabled:opacity-50"
            title="Download full Excel spreadsheet with all team and player registration data"
          >
            {exporting ? (
              <>
                <span className="h-3.5 w-3.5 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin" />
                Exporting Excel…
              </>
            ) : (
              <>
                📥 Export Registrations (Excel .xlsx)
              </>
            )}
          </button>
          <span className="border border-ember-400 bg-ember-600/10 px-3 py-2 font-mono text-xs text-ember-400">
            CLEARANCE: ADMIN
          </span>
        </div>
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
        {tab === "Registrations"       && <RegistrationsPanel onDownloadExcel={downloadExcel} exporting={exporting} />}
        {tab === "Fixtures"            && <FixturesPanel />}
        {tab === "Leaderboard Control" && <LeaderboardControlPanel />}
        {tab === "Announcements"       && <AnnouncementsPanel />}
        {tab === "Teams Control"       && <TeamsControlPanel onDownloadExcel={downloadExcel} exporting={exporting} />}
        {tab === "Audit log"           && <AuditPanel />}
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */

function RegistrationsPanel({ onDownloadExcel, exporting }: { onDownloadExcel?: () => void; exporting?: boolean }) {
  const [teams, setTeams] = useState<any[]>([]);
  const [localDownloading, setLocalDownloading] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/teams").then((r) => r.json()).then((j) => setTeams(j.teams ?? []));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, action: "approve" | "reject") {
    await fetch(`/api/teams/${id}/${action}`, { method: "PATCH" });
    load();
  }

  async function downloadExcel() {
    if (onDownloadExcel) {
      onDownloadExcel();
      return;
    }
    setLocalDownloading(true);
    try {
      const res = await fetch("/api/admin/export/registrations");
      if (!res.ok) { alert("Export failed."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `CODFEST_Registrations_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setLocalDownloading(false);
    }
  }

  const isBusy = exporting || localDownloading;
  const pending = teams.filter((t) => t.status === "pending");
  const others = teams.filter((t) => t.status !== "pending");

  return (
    <div className="space-y-8">
      {/* EXPORT BANNER / BUTTON */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/30 via-night-850 to-emerald-950/30 p-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Registration Database Export
            </h3>
          </div>
          <p className="mt-0.5 font-mono text-xs text-zinc-400">
            Total teams: <span className="font-bold text-white">{teams.length}</span> ({pending.length} pending, {teams.filter(t => t.status === "approved").length} approved)
          </p>
        </div>
        <button
          onClick={downloadExcel}
          disabled={isBusy}
          className="flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-600/20 px-5 py-2.5 font-mono text-xs font-bold text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:bg-emerald-600/30 hover:text-white transition-all disabled:opacity-50"
        >
          {isBusy ? (
            <>
              <span className="h-4 w-4 rounded-full border-2 border-emerald-300 border-t-transparent animate-spin" />
              Generating Excel file…
            </>
          ) : (
            <>
              📊 Download All Registrations (.xlsx)
            </>
          )}
        </button>
      </div>

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
          {busy ? "Generatingâ€¦" : "Generate bracket from approved teams"}
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
                  {m.final_score1}â€“{m.final_score2}
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
            No fixtures yet â€” generate the bracket once teams are approved.
          </p>
        )}
      </div>
    </div>
  );
}
/* ================================================================== */
/*  LEADERBOARD CONTROL & CLASH SCORE MANAGER                          */
/* ================================================================== */

interface PlayerStatRow {
  name: string;
  score: number | string;
  kills: number | string;
  assists: number | string;
  deaths: number | string;
  ping: number | string;
}

interface TeamWithRoster {
  id: string;
  team_name: string;
  logo_url: string | null;
  status: string;
  category?: "boys" | "girls";
  display_order?: number | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  players?: { id: string; player_name: string; game_id?: string }[];
}

const slideVariants = {
  enter: (dir: number) => ({
    x: dir >= 0 ? 250 : -250,
    opacity: 0,
    scale: 0.98,
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
    scale: 0.98,
    transition: {
      x: { type: "spring", stiffness: 320, damping: 30 },
      opacity: { duration: 0.2 },
    },
  }),
};

function LeaderboardControlPanel() {
  const [teams, setTeams] = useState<TeamWithRoster[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  // Division split filter state ("all" | "boys" | "girls")
  const [adminDivision, setAdminDivision] = useState<"all" | "boys" | "girls">("all");
  const [standingsSearch, setStandingsSearch] = useState("");
  const [batchSaveBusy, setBatchSaveBusy] = useState(false);
  const [batchSaveMsg, setBatchSaveMsg] = useState<string | null>(null);

  // Clash editor state
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [team1Id, setTeam1Id] = useState<string>("");
  const [team2Id, setTeam2Id] = useState<string>("");
  const [mapName, setMapName] = useState<string>("Crash");
  const [roundNum, setRoundNum] = useState<number>(1);
  const [matchStatus, setMatchStatus] = useState<"finished" | "live" | "scheduled">("finished");
  const [matchNote, setMatchNote] = useState<string>("");

  const [team1Players, setTeam1Players] = useState<PlayerStatRow[]>([
    { name: "Player 1", score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 },
    { name: "Player 2", score: 0, kills: 0, assists: 0, deaths: 0, ping: 40 },
    { name: "Player 3", score: 0, kills: 0, assists: 0, deaths: 0, ping: 30 },
    { name: "Player 4", score: 0, kills: 0, assists: 0, deaths: 0, ping: 45 },
    { name: "Player 5", score: 0, kills: 0, assists: 0, deaths: 0, ping: 38 },
  ]);

  const [team2Players, setTeam2Players] = useState<PlayerStatRow[]>([
    { name: "Player 1", score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 },
    { name: "Player 2", score: 0, kills: 0, assists: 0, deaths: 0, ping: 40 },
    { name: "Player 3", score: 0, kills: 0, assists: 0, deaths: 0, ping: 30 },
    { name: "Player 4", score: 0, kills: 0, assists: 0, deaths: 0, ping: 45 },
    { name: "Player 5", score: 0, kills: 0, assists: 0, deaths: 0, ping: 38 },
  ]);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Slide carousel state for clashes
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [autoSlide, setAutoSlide] = useState(false);

  // Quick standings edit modal or state
  const [editingStandings, setEditingStandings] = useState<Record<string, Partial<TeamWithRoster>>>({});
  const [standingsBusy, setStandingsBusy] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/clash");
      const j = await res.json();
      setTeams(j.teams ?? []);
      setMatches(j.matches ?? []);

      // If no teams selected yet, set defaults if available
      if (j.teams?.length >= 2 && !team1Id && !team2Id) {
        setTeam1Id(j.teams[0].id);
        setTeam2Id(j.teams[1].id);
        if (j.teams[0].players?.length > 0) {
          setTeam1Players(
            j.teams[0].players.map((p: any) => ({
              name: p.player_name,
              score: 0,
              kills: 0,
              assists: 0,
              deaths: 0,
              ping: 35,
            }))
          );
        }
        if (j.teams[1].players?.length > 0) {
          setTeam2Players(
            j.teams[1].players.map((p: any) => ({
              name: p.player_name,
              score: 0,
              kills: 0,
              assists: 0,
              deaths: 0,
              ping: 35,
            }))
          );
        }
      }
    } finally {
      setLoading(false);
    }
  }, [team1Id, team2Id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle team 1 change -> auto load logo & roster
  const handleTeam1Select = (id: string) => {
    setTeam1Id(id);
    const found = teams.find((t) => t.id === id);
    if (found?.players && found.players.length > 0) {
      setTeam1Players(
        found.players.map((p) => ({
          name: p.player_name,
          score: 0,
          kills: 0,
          assists: 0,
          deaths: 0,
          ping: 35,
        }))
      );
    }
  };

  // Handle team 2 change -> auto load logo & roster
  const handleTeam2Select = (id: string) => {
    setTeam2Id(id);
    const found = teams.find((t) => t.id === id);
    if (found?.players && found.players.length > 0) {
      setTeam2Players(
        found.players.map((p) => ({
          name: p.player_name,
          score: 0,
          kills: 0,
          assists: 0,
          deaths: 0,
          ping: 35,
        }))
      );
    }
  };

  // Load a match from fixtures into editor
  const loadMatchIntoEditor = (m: Match) => {
    setSelectedMatchId(m.id);
    setTeam1Id(m.team1_id ?? "");
    setTeam2Id(m.team2_id ?? "");
    setMapName(m.map ?? "Crash");
    setRoundNum(m.round ?? 1);
    setMatchStatus((m.status === "live" || m.status === "finished") ? m.status : "finished");

    // Load team 1 player scorecards if saved in submission
    const sub1 = m.submission_team1 as any;
    if (sub1?.players && Array.isArray(sub1.players) && sub1.players.length > 0) {
      setTeam1Players(sub1.players);
    } else {
      const found = teams.find((t) => t.id === m.team1_id);
      if (found?.players?.length) {
        setTeam1Players(found.players.map((p) => ({ name: p.player_name, score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 })));
      }
    }

    // Load team 2 player scorecards if saved in submission
    const sub2 = m.submission_team2 as any;
    if (sub2?.players && Array.isArray(sub2.players) && sub2.players.length > 0) {
      setTeam2Players(sub2.players);
    } else {
      const found = teams.find((t) => t.id === m.team2_id);
      if (found?.players?.length) {
        setTeam2Players(found.players.map((p) => ({ name: p.player_name, score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 })));
      }
    }

    setSaveMsg(null);
  };

  const resetToNewClash = () => {
    setSelectedMatchId(null);
    setSaveMsg(null);
    if (teams.length >= 2) {
      handleTeam1Select(teams[0].id);
      handleTeam2Select(teams[1].id);
    }
  };

  // Helper row mutations
  const updateTeam1Row = (index: number, field: keyof PlayerStatRow, val: any) => {
    setTeam1Players((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "name" ? val : val === "" ? "" : isNaN(Number(val)) ? val : Number(val),
      };
      return next;
    });
  };

  const updateTeam2Row = (index: number, field: keyof PlayerStatRow, val: any) => {
    setTeam2Players((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        [field]: field === "name" ? val : val === "" ? "" : isNaN(Number(val)) ? val : Number(val),
      };
      return next;
    });
  };

  const addTeam1Row = () => {
    setTeam1Players((p) => [...p, { name: `Player ${p.length + 1}`, score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 }]);
  };

  const removeTeam1Row = (index: number) => {
    if (team1Players.length <= 1) return;
    setTeam1Players((p) => p.filter((_, i) => i !== index));
  };

  const addTeam2Row = () => {
    setTeam2Players((p) => [...p, { name: `Player ${p.length + 1}`, score: 0, kills: 0, assists: 0, deaths: 0, ping: 35 }]);
  };

  const removeTeam2Row = (index: number) => {
    if (team2Players.length <= 1) return;
    setTeam2Players((p) => p.filter((_, i) => i !== index));
  };

  // Totals and automatic winner calculation
  const totalScore1 = team1Players.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
  const totalKills1 = team1Players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
  const totalAssists1 = team1Players.reduce((sum, p) => sum + (Number(p.assists) || 0), 0);
  const totalDeaths1 = team1Players.reduce((sum, p) => sum + (Number(p.deaths) || 0), 0);
  const avgPing1 = team1Players.length ? Math.round(team1Players.reduce((sum, p) => sum + (Number(p.ping) || 0), 0) / team1Players.length) : 0;

  const totalScore2 = team2Players.reduce((sum, p) => sum + (Number(p.score) || 0), 0);
  const totalKills2 = team2Players.reduce((sum, p) => sum + (Number(p.kills) || 0), 0);
  const totalAssists2 = team2Players.reduce((sum, p) => sum + (Number(p.assists) || 0), 0);
  const totalDeaths2 = team2Players.reduce((sum, p) => sum + (Number(p.deaths) || 0), 0);
  const avgPing2 = team2Players.length ? Math.round(team2Players.reduce((sum, p) => sum + (Number(p.ping) || 0), 0) / team2Players.length) : 0;

  const team1Obj = teams.find((t) => t.id === team1Id);
  const team2Obj = teams.find((t) => t.id === team2Id);

  let calculatedWinner: "team1" | "team2" | "draw" = "draw";
  let winnerTitle = "TIED MATCH";
  if (totalScore1 > totalScore2) {
    calculatedWinner = "team1";
    winnerTitle = `${team1Obj?.team_name ?? "Team A"} WINS (+${totalScore1 - totalScore2} pts)`;
  } else if (totalScore2 > totalScore1) {
    calculatedWinner = "team2";
    winnerTitle = `${team2Obj?.team_name ?? "Team B"} WINS (+${totalScore2 - totalScore1} pts)`;
  } else if (totalKills1 > totalKills2) {
    calculatedWinner = "team1";
    winnerTitle = `${team1Obj?.team_name ?? "Team A"} WINS by Kills (${totalKills1} vs ${totalKills2})`;
  } else if (totalKills2 > totalKills1) {
    calculatedWinner = "team2";
    winnerTitle = `${team2Obj?.team_name ?? "Team B"} WINS by Kills (${totalKills2} vs ${totalKills1})`;
  }

  // Save clash score to DB & broadcast
  const saveClashScore = async () => {
    if (!team1Id || !team2Id) {
      setSaveMsg({ type: "error", text: "Please select both Team A and Team B." });
      return;
    }
    if (team1Id === team2Id) {
      setSaveMsg({ type: "error", text: "Team A and Team B cannot be the same team." });
      return;
    }

    setSaveBusy(true);
    setSaveMsg(null);

    try {
      const payload = {
        match_id: selectedMatchId || undefined,
        team1_id: team1Id,
        team2_id: team2Id,
        map: mapName,
        round: roundNum,
        status: matchStatus,
        team1_players: team1Players.map((p) => ({
          name: p.name || "Player",
          score: Number(p.score) || 0,
          kills: Number(p.kills) || 0,
          assists: Number(p.assists) || 0,
          deaths: Number(p.deaths) || 0,
          ping: Number(p.ping) || 0,
        })),
        team2_players: team2Players.map((p) => ({
          name: p.name || "Player",
          score: Number(p.score) || 0,
          kills: Number(p.kills) || 0,
          assists: Number(p.assists) || 0,
          deaths: Number(p.deaths) || 0,
          ping: Number(p.ping) || 0,
        })),
        note: matchNote || undefined,
      };

      const res = await fetch("/api/admin/clash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) {
        setSaveMsg({ type: "error", text: json.error ?? "Failed to save clash score." });
      } else {
        setSaveMsg({
          type: "success",
          text: `✓ Successfully saved Clash result! Calculated Winner: ${calculatedWinner === "team1" ? team1Obj?.team_name : calculatedWinner === "team2" ? team2Obj?.team_name : "Draw"}. Leaderboard & bracket updated!`,
        });
        loadData();
      }
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "Network error while saving." });
    } finally {
      setSaveBusy(false);
    }
  };

  // Delete a clash score
  const deleteClash = async (matchId: string) => {
    if (!confirm("Delete this clash result? This will recalculate standings and cannot be undone.")) return;
    setDeleteBusy(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/admin/clash", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveMsg({ type: "error", text: json.error ?? "Failed to delete clash." });
      } else {
        setSaveMsg({ type: "success", text: "✓ Clash deleted and standings recalculated." });
        // Reset slide index if needed
        setSlideIndex(0);
        loadData();
      }
    } catch (e: any) {
      setSaveMsg({ type: "error", text: e.message || "Network error." });
    } finally {
      setDeleteBusy(false);
    }
  };

  // Save quick manual standings override
  const saveStandingsOverride = async (teamId: string) => {
    const edit = editingStandings[teamId];
    if (!edit) return;
    setStandingsBusy((p) => ({ ...p, [teamId]: true }));
    const cleanEdit = {
      ...(edit.points !== undefined ? { points: Number(edit.points) || 0 } : {}),
      ...(edit.wins !== undefined ? { wins: Number(edit.wins) || 0 } : {}),
      ...(edit.losses !== undefined ? { losses: Number(edit.losses) || 0 } : {}),
      ...(edit.draws !== undefined ? { draws: Number(edit.draws) || 0 } : {}),
      ...(edit.maps_won !== undefined ? { maps_won: Number(edit.maps_won) || 0 } : {}),
      ...(edit.maps_lost !== undefined ? { maps_lost: Number(edit.maps_lost) || 0 } : {}),
    };
    try {
      const res = await fetch("/api/admin/clash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, ...cleanEdit }),
      });
      if (res.ok) {
        loadData();
        setEditingStandings((prev) => {
          const next = { ...prev };
          delete next[teamId];
          return next;
        });
      }
    } finally {
      setStandingsBusy((p) => ({ ...p, [teamId]: false }));
    }
  };

  const boysCount = teams.filter((t) => (t.category ?? "boys") === "boys").length;
  const girlsCount = teams.filter((t) => t.category === "girls").length;

  const sortedAndFilteredTeams = useMemo(() => {
    let list = [...teams];
    if (adminDivision !== "all") {
      list = list.filter((t) => (t.category ?? "boys") === adminDivision);
    }
    if (standingsSearch.trim()) {
      const q = standingsSearch.toLowerCase();
      list = list.filter((t) => t.team_name.toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const ordA = a.display_order ?? null;
      const ordB = b.display_order ?? null;
      if (ordA !== null && ordB !== null) return ordA - ordB;
      if (ordA !== null) return -1;
      if (ordB !== null) return 1;
      return (
        b.points - a.points ||
        (b.maps_won - b.maps_lost) - (a.maps_won - a.maps_lost) ||
        b.wins - a.wins
      );
    });
  }, [teams, adminDivision, standingsSearch]);

  // Reorder team up/down
  const moveTeamPosition = async (teamId: string, direction: "up" | "down") => {
    const list = [...sortedAndFilteredTeams];
    const currentIndex = list.findIndex((t) => t.id === teamId);
    if (currentIndex === -1) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const currentTeam = list[currentIndex];
    const targetTeam = list[targetIndex];
    list[currentIndex] = targetTeam;
    list[targetIndex] = currentTeam;

    const newOrders: Record<string, number> = {};
    list.forEach((t, idx) => {
      newOrders[t.id] = idx + 1;
    });

    setTeams((prev) =>
      prev.map((t) => (newOrders[t.id] ? { ...t, display_order: newOrders[t.id] } : t))
    );

    try {
      await fetch("/api/admin/clash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_orders: newOrders }),
      });
      loadData();
    } catch {
      // ignore
    }
  };

  // Change team division (boys / girls)
  const changeTeamCategory = async (teamId: string, newCat: "boys" | "girls") => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, category: newCat } : t))
    );

    try {
      await fetch("/api/admin/clash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, category: newCat }),
      });
      loadData();
    } catch {
      // ignore
    }
  };

  // Change numeric position directly
  const changeTeamPosition = async (teamId: string, pos: number) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, display_order: pos } : t))
    );

    try {
      await fetch("/api/admin/clash", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team_id: teamId, display_order: pos }),
      });
      loadData();
    } catch {
      // ignore
    }
  };

  // Save all modified standings and positions
  const saveAllModifiedStandings = async () => {
    const teamIds = Object.keys(editingStandings);
    if (teamIds.length === 0) return;
    setBatchSaveBusy(true);
    setBatchSaveMsg(null);
    try {
      for (const tId of teamIds) {
        await saveStandingsOverride(tId);
      }
      setBatchSaveMsg("✓ All standings saved successfully.");
      setTimeout(() => setBatchSaveMsg(null), 3000);
    } catch {
      setBatchSaveMsg("Error saving some standings.");
    } finally {
      setBatchSaveBusy(false);
    }
  };

  // Clash slides list (matches that have team1 and team2)
  const clashSlides = matches.filter((m) => m.team1 && m.team2);

  const nextSlide = () => {
    if (clashSlides.length === 0) return;
    setSlideDirection(1);
    setSlideIndex((prev) => (prev + 1) % clashSlides.length);
  };

  const prevSlide = () => {
    if (clashSlides.length === 0) return;
    setSlideDirection(-1);
    setSlideIndex((prev) => (prev - 1 + clashSlides.length) % clashSlides.length);
  };

  useEffect(() => {
    if (!autoSlide || clashSlides.length <= 1) return;
    const interval = setInterval(nextSlide, 5000);
    return () => clearInterval(interval);
  }, [autoSlide, clashSlides.length]);

  return (
    <div className="space-y-10">
      {/* TOP DIVISION SPLIT FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-night-700 bg-night-850 p-4 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="h-3 w-3 rounded-full bg-ember-400 animate-pulse" />
          <div>
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-white">
              Division Filter & Maintenance
            </h2>
            <p className="font-mono text-[11px] text-zinc-400">
              Manage Boys & Girls divisions and set custom standings ranking
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setAdminDivision("all")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              adminDivision === "all"
                ? "border border-amber-500/60 bg-amber-500/20 text-amber-300 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>🏆 All Teams</span>
            <span className="rounded-full bg-night-900 px-2 py-0.5 text-[10px] text-zinc-300 border border-night-700">
              {teams.length}
            </span>
          </button>

          <button
            onClick={() => setAdminDivision("boys")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              adminDivision === "boys"
                ? "border border-blue-500/70 bg-blue-600/25 text-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>👦 Boys Division</span>
            <span className="rounded-full bg-blue-950 px-2 py-0.5 text-[10px] text-blue-300 border border-blue-500/30">
              {boysCount}
            </span>
          </button>

          <button
            onClick={() => setAdminDivision("girls")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 font-mono text-xs font-bold transition-all ${
              adminDivision === "girls"
                ? "border border-pink-500/70 bg-pink-600/25 text-pink-300 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
                : "border border-night-700 bg-night-800 text-zinc-400 hover:text-white"
            }`}
          >
            <span>👧 Girls Division</span>
            <span className="rounded-full bg-pink-950 px-2 py-0.5 text-[10px] text-pink-300 border border-pink-500/30">
              {girlsCount}
            </span>
          </button>
        </div>
      </div>

      {/* SECTION 1: CLASH SLIDES SHOWCASE (CAROUSEL WITH RIGHT-SLIDE ANIMATION) */}
      <div className="rounded-2xl border border-night-700 bg-night-900/90 p-6 shadow-2xl backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-night-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-ember-500 animate-pulse" />
              <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
                Live Clash Showcase Carousel
              </h2>
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              Interactive match slides with animated right-side slide transitions & scorecard details
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoSlide(!autoSlide)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-bold transition-all ${
                autoSlide
                  ? "border-green-500/50 bg-green-500/10 text-green-400"
                  : "border-night-700 bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              {autoSlide ? "▶ Auto-play ON" : "⏸ Auto-play OFF"}
            </button>
            <div className="flex items-center gap-1 bg-night-800 p-1 rounded-lg border border-night-700">
              <button
                onClick={prevSlide}
                className="rounded px-2.5 py-1 text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                title="Previous Slide (Left)"
              >
                ◀
              </button>
              <span className="font-mono text-xs font-bold text-ember-400 px-2">
                {clashSlides.length ? `${slideIndex + 1} / ${clashSlides.length}` : "0 / 0"}
              </span>
              <button
                onClick={nextSlide}
                className="rounded px-2.5 py-1 text-sm font-bold text-zinc-300 hover:bg-night-700 hover:text-white transition-colors"
                title="Next Slide (Right Slide Animation)"
              >
                ▶
              </button>
            </div>
          </div>
        </div>

        {clashSlides.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-mono text-sm text-zinc-500">No clash fixtures logged yet.</p>
            <p className="mt-1 text-xs text-zinc-600">Use the Clash Score Editor below to log your first Team A vs Team B match!</p>
          </div>
        ) : (
          <div className="relative overflow-hidden pt-6 pb-2 min-h-[460px]">
            <AnimatePresence initial={false} custom={slideDirection} mode="wait">
              {(() => {
                const currentMatch = clashSlides[slideIndex] ?? clashSlides[0];
                if (!currentMatch) return null;

                const sub1 = currentMatch.submission_team1 as any;
                const sub2 = currentMatch.submission_team2 as any;
                const pList1: PlayerStatRow[] = sub1?.players ?? [];
                const pList2: PlayerStatRow[] = sub2?.players ?? [];

                const score1 = currentMatch.final_score1 ?? sub1?.score_own ?? 0;
                const score2 = currentMatch.final_score2 ?? sub2?.score_own ?? 0;
                const isWinner1 = currentMatch.winner_id === currentMatch.team1?.id || score1 > score2;
                const isWinner2 = currentMatch.winner_id === currentMatch.team2?.id || score2 > score1;

                return (
                  <motion.div
                    key={currentMatch.id}
                    custom={slideDirection}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="w-full space-y-6"
                  >
                    {/* CLASH HEADER: TEAM A vs TEAM B ANIMATED BANNER */}
                    <div className="relative overflow-hidden rounded-xl border border-night-700 bg-gradient-to-r from-blue-950/40 via-night-850 to-red-950/40 p-6 shadow-xl">
                      <div className="flex flex-wrap items-center justify-between gap-6">
                        {/* TEAM A */}
                        <div className="flex items-center gap-4 flex-1 min-w-[220px]">
                          <div className={`relative rounded-xl border-2 p-1 ${isWinner1 ? "border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "border-night-700 bg-night-800"}`}>
                            <TeamMark name={currentMatch.team1?.team_name ?? "Team 1"} logoUrl={currentMatch.team1?.logo_url} size={64} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-blue-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-400">TEAM A</span>
                              {isWinner1 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-400 border border-amber-500/30">
                                  🏆 VICTORY
                                </span>
                              )}
                            </div>
                            <h3 className="mt-1 font-display text-2xl font-black uppercase text-white truncate max-w-[240px]">
                              {currentMatch.team1?.team_name ?? "Team A"}
                            </h3>
                            <div className="mt-1 font-mono text-3xl font-black text-blue-400">
                              {score1} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                        </div>

                        {/* VS BADGE & MAP INFO */}
                        <div className="text-center px-4">
                          <div className="inline-flex items-center justify-center rounded-full border border-ember-500/40 bg-gradient-to-r from-ember-600/20 to-orange-600/20 px-4 py-1.5 font-display text-lg font-black tracking-widest text-ember-400 shadow-[0_0_15px_rgba(249,115,22,0.4)] animate-pulse">
                            VS
                          </div>
                          <div className="mt-2 font-mono text-xs font-bold uppercase tracking-widest text-zinc-400">
                            MAP: <span className="text-ember-400">{currentMatch.map || "Crash"}</span>
                          </div>
                          <div className="font-mono text-[11px] text-zinc-500">
                            {ROUND_NAMES[currentMatch.round] ?? `Round ${currentMatch.round}`}
                          </div>
                          <StatusBadge status={currentMatch.status} />
                        </div>

                        {/* TEAM B */}
                        <div className="flex items-center justify-end gap-4 flex-1 min-w-[220px] text-right">
                          <div>
                            <div className="flex items-center justify-end gap-2">
                              {isWinner2 && (
                                <span className="flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-amber-400 border border-amber-500/30">
                                  🏆 VICTORY
                                </span>
                              )}
                              <span className="rounded bg-red-500/20 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-red-400">TEAM B</span>
                            </div>
                            <h3 className="mt-1 font-display text-2xl font-black uppercase text-white truncate max-w-[240px]">
                              {currentMatch.team2?.team_name ?? "Team B"}
                            </h3>
                            <div className="mt-1 font-mono text-3xl font-black text-red-400">
                              {score2} <span className="text-xs font-normal text-zinc-500">PTS</span>
                            </div>
                          </div>
                          <div className={`relative rounded-xl border-2 p-1 ${isWinner2 ? "border-amber-400 bg-amber-500/10 shadow-[0_0_20px_rgba(245,158,11,0.3)]" : "border-night-700 bg-night-800"}`}>
                            <TeamMark name={currentMatch.team2?.team_name ?? "Team 2"} logoUrl={currentMatch.team2?.logo_url} size={64} />
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-night-800 pt-3">
                        <div className="font-mono text-xs text-zinc-400">
                          Winner:{" "}
                          <span className="font-bold text-amber-400">
                            {isWinner1 ? currentMatch.team1?.team_name : isWinner2 ? currentMatch.team2?.team_name : "Tied"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => loadMatchIntoEditor(currentMatch)}
                            className="rounded-lg border border-ember-500/40 bg-ember-600/10 px-3 py-1 font-mono text-xs font-bold text-ember-400 hover:bg-ember-600/20 transition-all"
                          >
                            ✎ Edit this Clash
                          </button>
                          <button
                            onClick={() => deleteClash(currentMatch.id)}
                            disabled={deleteBusy}
                            className="rounded-lg border border-red-500/40 bg-red-600/10 px-3 py-1 font-mono text-xs font-bold text-red-400 hover:bg-red-600/20 transition-all disabled:opacity-40"
                          >
                            {deleteBusy ? "Deleting…" : "🗑 Delete"}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* SCORECARD TABLES */}
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* TEAM A STATS TABLE */}
                      <div className="rounded-xl border border-blue-900/30 bg-night-850 p-4 shadow-lg">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            <span className="font-display text-sm font-bold uppercase text-blue-400">
                              {currentMatch.team1?.team_name ?? "Team A"} Scorecard
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-blue-300">Total: {score1} PTS</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-700 text-[10px] uppercase text-zinc-500">
                                <th className="py-2 px-2">Player</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/60">
                              {pList1.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-4 text-center text-zinc-500">No individual player data logged.</td>
                                </tr>
                              ) : (
                                pList1.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-night-800/50">
                                    <td className="py-2 px-2 font-bold text-white truncate max-w-[120px]">{p.name}</td>
                                    <td className="py-2 px-2 text-right font-bold text-amber-400">{p.score}</td>
                                    <td className="py-2 px-2 text-center text-green-400">{p.kills}</td>
                                    <td className="py-2 px-2 text-center text-blue-400">{p.assists}</td>
                                    <td className="py-2 px-2 text-center text-red-400">{p.deaths}</td>
                                    <td className="py-2 px-2 text-right text-zinc-400">{p.ping}ms</td>
                                  </tr>
                                ))
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* TEAM B STATS TABLE */}
                      <div className="rounded-xl border border-red-900/30 bg-night-850 p-4 shadow-lg">
                        <div className="flex items-center justify-between border-b border-night-800 pb-2 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            <span className="font-display text-sm font-bold uppercase text-red-400">
                              {currentMatch.team2?.team_name ?? "Team B"} Scorecard
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-red-300">Total: {score2} PTS</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left font-mono text-xs">
                            <thead>
                              <tr className="border-b border-night-700 text-[10px] uppercase text-zinc-500">
                                <th className="py-2 px-2">Player</th>
                                <th className="py-2 px-2 text-right">Score</th>
                                <th className="py-2 px-2 text-center">K</th>
                                <th className="py-2 px-2 text-center">A</th>
                                <th className="py-2 px-2 text-center">D</th>
                                <th className="py-2 px-2 text-right">Ping</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-night-800/60">
                              {pList2.length === 0 ? (
                                <tr>
                                  <td colSpan={6} className="py-4 text-center text-zinc-500">No individual player data logged.</td>
                                </tr>
                              ) : (
                                pList2.map((p, idx) => (
                                  <tr key={idx} className="hover:bg-night-800/50">
                                    <td className="py-2 px-2 font-bold text-white truncate max-w-[120px]">{p.name}</td>
                                    <td className="py-2 px-2 text-right font-bold text-amber-400">{p.score}</td>
                                    <td className="py-2 px-2 text-center text-green-400">{p.kills}</td>
                                    <td className="py-2 px-2 text-center text-blue-400">{p.assists}</td>
                                    <td className="py-2 px-2 text-center text-red-400">{p.deaths}</td>
                                    <td className="py-2 px-2 text-right text-zinc-400">{p.ping}ms</td>
                                  </tr>
                                ))
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
        )}
      </div>

      {/* SECTION 2: LEADERBOARD CLASH SCORE EDITOR */}
      <div className="rounded-2xl border border-ember-500/30 bg-night-900/90 p-6 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-night-800 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
              {selectedMatchId ? "Edit Clash Scorecard" : "Create New Team Clash"}
            </h2>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              Select teams (logos auto-fetch from registration), edit member rows, and publish scores
            </p>
          </div>
          {selectedMatchId && (
            <button
              onClick={resetToNewClash}
              className="rounded-lg border border-night-700 bg-night-800 px-3 py-1.5 font-mono text-xs text-zinc-300 hover:text-white"
            >
              + Switch to New Clash
            </button>
          )}
        </div>

        {/* TEAM SELECTION & AUTO LOGO PICKUP ROW */}
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* TEAM A SELECTOR */}
          <div className="rounded-xl border border-blue-900/50 bg-blue-950/20 p-4">
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-blue-400 block mb-2">
              Select Team A
            </label>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-blue-500/40 bg-night-800 p-1 flex-shrink-0">
                <TeamMark name={team1Obj?.team_name ?? "Team A"} logoUrl={team1Obj?.logo_url} size={48} />
              </div>
              <select
                value={team1Id}
                onChange={(e) => handleTeam1Select(e.target.value)}
                className="input flex-1 font-semibold"
              >
                <option value="" disabled>-- Select Team A --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category === "girls" ? "[GIRLS] " : "[BOYS] "}
                    {t.team_name} ({t.players?.length ?? 0} members)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TEAM B SELECTOR */}
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4">
            <label className="font-mono text-xs font-bold uppercase tracking-wider text-red-400 block mb-2">
              Select Team B
            </label>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-red-500/40 bg-night-800 p-1 flex-shrink-0">
                <TeamMark name={team2Obj?.team_name ?? "Team B"} logoUrl={team2Obj?.logo_url} size={48} />
              </div>
              <select
                value={team2Id}
                onChange={(e) => handleTeam2Select(e.target.value)}
                className="input flex-1 font-semibold"
              >
                <option value="" disabled>-- Select Team B --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category === "girls" ? "[GIRLS] " : "[BOYS] "}
                    {t.team_name} ({t.players?.length ?? 0} members)
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* REAL-TIME AUTO CALCULATED WINNER BANNER */}
        <div className="mt-6 rounded-xl border border-ember-500/40 bg-gradient-to-r from-ember-600/10 via-night-850 to-ember-600/10 p-4 text-center">
          <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
            Real-Time Automatic Winner Calculation
          </div>
          <div className="mt-1 font-display text-2xl font-black uppercase text-ember-400 flex items-center justify-center gap-3">
            <span className="text-blue-400">{team1Obj?.team_name ?? "Team A"} ({totalScore1})</span>
            <span className="text-zinc-500 text-lg">vs</span>
            <span className="text-red-400">{team2Obj?.team_name ?? "Team B"} ({totalScore2})</span>
          </div>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-ember-500/50 bg-ember-600/20 px-4 py-1 font-mono text-xs font-bold text-white shadow-lg">
            <span>🏆 RESULT:</span>
            <span className={calculatedWinner === "team1" ? "text-blue-400 font-black" : calculatedWinner === "team2" ? "text-red-400 font-black" : "text-amber-400 font-black"}>
              {winnerTitle}
            </span>
          </div>
        </div>

        {/* MEMBER STAT ROWS: TEAM A */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-blue-500" />
              <h3 className="font-display font-bold text-white uppercase text-base">
                Team A: {team1Obj?.team_name ?? "Team A"} Members Scorecard
              </h3>
            </div>
            <button
              onClick={addTeam1Row}
              className="rounded border border-blue-500/40 bg-blue-600/10 px-3 py-1 font-mono text-xs font-bold text-blue-400 hover:bg-blue-600/20 transition-all"
            >
              + Add Member Row
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-night-700 bg-night-850 p-2">
            <table className="w-full min-w-[700px] text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-night-700 text-[10px] font-bold uppercase text-zinc-400 bg-night-800/60">
                  <th className="py-2.5 px-3">Member Name</th>
                  <th className="py-2.5 px-3 text-center w-24">Score</th>
                  <th className="py-2.5 px-3 text-center w-20">Kills</th>
                  <th className="py-2.5 px-3 text-center w-20">Assists</th>
                  <th className="py-2.5 px-3 text-center w-20">Deaths</th>
                  <th className="py-2.5 px-3 text-center w-20">Ping (ms)</th>
                  <th className="py-2.5 px-3 text-center w-16">K/D</th>
                  <th className="py-2.5 px-2 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-800">
                {team1Players.map((p, idx) => {
                  const kills = Number(p.kills) || 0;
                  const deaths = Number(p.deaths) || 0;
                  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
                  return (
                    <tr key={idx} className="hover:bg-night-800/40">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => updateTeam1Row(idx, "name", e.target.value)}
                          className="input !py-1 !text-xs font-bold text-white w-full"
                          placeholder="Member name"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.score ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam1Row(idx, "score", (Number(p.score) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam1Row(idx, "score", Math.max(0, (Number(p.score) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam1Row(idx, "score", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-amber-400 text-center w-20 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.kills ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam1Row(idx, "kills", (Number(p.kills) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam1Row(idx, "kills", Math.max(0, (Number(p.kills) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam1Row(idx, "kills", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-green-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.assists ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam1Row(idx, "assists", (Number(p.assists) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam1Row(idx, "assists", Math.max(0, (Number(p.assists) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam1Row(idx, "assists", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-blue-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.deaths ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam1Row(idx, "deaths", (Number(p.deaths) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam1Row(idx, "deaths", Math.max(0, (Number(p.deaths) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam1Row(idx, "deaths", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-red-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.ping ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam1Row(idx, "ping", (Number(p.ping) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam1Row(idx, "ping", Math.max(0, (Number(p.ping) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam1Row(idx, "ping", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs text-zinc-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-zinc-300">{kd}</td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => removeTeam1Row(idx)}
                          className="text-zinc-600 hover:text-red-400 p-1 text-xs"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-night-700 bg-night-800/80 font-bold">
                  <td className="py-2.5 px-3 text-blue-400">Team A Totals</td>
                  <td className="py-2.5 px-3 text-center text-amber-400">{totalScore1}</td>
                  <td className="py-2.5 px-3 text-center text-green-400">{totalKills1}</td>
                  <td className="py-2.5 px-3 text-center text-blue-400">{totalAssists1}</td>
                  <td className="py-2.5 px-3 text-center text-red-400">{totalDeaths1}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-400">{avgPing1}ms</td>
                  <td className="py-2.5 px-3 text-center text-zinc-300">
                    {totalDeaths1 > 0 ? (totalKills1 / totalDeaths1).toFixed(2) : totalKills1.toFixed(2)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* MEMBER STAT ROWS: TEAM B */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <h3 className="font-display font-bold text-white uppercase text-base">
                Team B: {team2Obj?.team_name ?? "Team B"} Members Scorecard
              </h3>
            </div>
            <button
              onClick={addTeam2Row}
              className="rounded border border-red-500/40 bg-red-600/10 px-3 py-1 font-mono text-xs font-bold text-red-400 hover:bg-red-600/20 transition-all"
            >
              + Add Member Row
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-night-700 bg-night-850 p-2">
            <table className="w-full min-w-[700px] text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-night-700 text-[10px] font-bold uppercase text-zinc-400 bg-night-800/60">
                  <th className="py-2.5 px-3">Member Name</th>
                  <th className="py-2.5 px-3 text-center w-24">Score</th>
                  <th className="py-2.5 px-3 text-center w-20">Kills</th>
                  <th className="py-2.5 px-3 text-center w-20">Assists</th>
                  <th className="py-2.5 px-3 text-center w-20">Deaths</th>
                  <th className="py-2.5 px-3 text-center w-20">Ping (ms)</th>
                  <th className="py-2.5 px-3 text-center w-16">K/D</th>
                  <th className="py-2.5 px-2 text-center w-12">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-800">
                {team2Players.map((p, idx) => {
                  const kills = Number(p.kills) || 0;
                  const deaths = Number(p.deaths) || 0;
                  const kd = deaths > 0 ? (kills / deaths).toFixed(2) : kills.toFixed(2);
                  return (
                    <tr key={idx} className="hover:bg-night-800/40">
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={p.name}
                          onChange={(e) => updateTeam2Row(idx, "name", e.target.value)}
                          className="input !py-1 !text-xs font-bold text-white w-full"
                          placeholder="Member name"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.score ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam2Row(idx, "score", (Number(p.score) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam2Row(idx, "score", Math.max(0, (Number(p.score) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam2Row(idx, "score", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-amber-400 text-center w-20 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.kills ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam2Row(idx, "kills", (Number(p.kills) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam2Row(idx, "kills", Math.max(0, (Number(p.kills) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam2Row(idx, "kills", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-green-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.assists ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam2Row(idx, "assists", (Number(p.assists) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam2Row(idx, "assists", Math.max(0, (Number(p.assists) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam2Row(idx, "assists", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-blue-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.deaths ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam2Row(idx, "deaths", (Number(p.deaths) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam2Row(idx, "deaths", Math.max(0, (Number(p.deaths) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam2Row(idx, "deaths", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs font-bold text-red-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          placeholder="0"
                          value={p.ping ?? ""}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "ArrowUp") {
                              e.preventDefault();
                              updateTeam2Row(idx, "ping", (Number(p.ping) || 0) + 1);
                            } else if (e.key === "ArrowDown") {
                              e.preventDefault();
                              updateTeam2Row(idx, "ping", Math.max(0, (Number(p.ping) || 0) - 1));
                            }
                          }}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            updateTeam2Row(idx, "ping", raw === "" ? "" : Number(raw));
                          }}
                          className="input !py-1 !text-xs text-zinc-400 text-center w-16 mx-auto"
                        />
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-zinc-300">{kd}</td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => removeTeam2Row(idx)}
                          className="text-zinc-600 hover:text-red-400 p-1 text-xs"
                          title="Remove row"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-night-700 bg-night-800/80 font-bold">
                  <td className="py-2.5 px-3 text-red-400">Team B Totals</td>
                  <td className="py-2.5 px-3 text-center text-amber-400">{totalScore2}</td>
                  <td className="py-2.5 px-3 text-center text-green-400">{totalKills2}</td>
                  <td className="py-2.5 px-3 text-center text-blue-400">{totalAssists2}</td>
                  <td className="py-2.5 px-3 text-center text-red-400">{totalDeaths2}</td>
                  <td className="py-2.5 px-3 text-center text-zinc-400">{avgPing2}ms</td>
                  <td className="py-2.5 px-3 text-center text-zinc-300">
                    {totalDeaths2 > 0 ? (totalKills2 / totalDeaths2).toFixed(2) : totalKills2.toFixed(2)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* CLASH META & PUBLISH ACTIONS */}
        <div className="mt-8 grid gap-4 sm:grid-cols-3 bg-night-850 p-4 rounded-xl border border-night-800">
          <div>
            <label className="label">Map</label>
            <select
              value={mapName}
              onChange={(e) => setMapName(e.target.value)}
              className="input font-mono"
            >
              {MAP_POOL.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Round</label>
            <select
              value={roundNum}
              onChange={(e) => setRoundNum(Number(e.target.value))}
              className="input font-mono"
            >
              <option value={1}>Round 1 (Round of 16)</option>
              <option value={2}>Round 2 (Quarter-Finals)</option>
              <option value={3}>Round 3 (Semi-Finals)</option>
              <option value={4}>Round 4 (Grand Final)</option>
            </select>
          </div>
          <div>
            <label className="label">Match Status</label>
            <select
              value={matchStatus}
              onChange={(e) => setMatchStatus(e.target.value as any)}
              className="input font-mono"
            >
              <option value="finished">Finished (Updates Leaderboard Standings)</option>
              <option value="live">Live (In Progress)</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </div>
        </div>

        {saveMsg && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 font-mono text-xs ${
              saveMsg.type === "success"
                ? "border-green-500/40 bg-green-500/10 text-green-300"
                : "border-red-500/40 bg-red-500/10 text-red-300"
            }`}
          >
            {saveMsg.text}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            onClick={saveClashScore}
            disabled={saveBusy}
            className="btn-primary !px-8 !py-3 text-sm font-bold shadow-[0_0_20px_rgba(249,115,22,0.4)]"
          >
            {saveBusy ? "Saving & Updating Standings…" : "💾 Save & Publish Clash Score to Leaderboard"}
          </button>
        </div>
      </div>

      {/* SECTION 3: DIRECT TEAM STANDINGS MANAGER & POSITION REORDERING */}
      <div className="rounded-2xl border border-night-700 bg-night-900/90 p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-night-800 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold uppercase tracking-wider text-white">
              Direct Team Standings Manager
            </h2>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              Control rankings with ▲ / ▼ buttons, type custom `# Pos`, switch Boys/Girls divisions, and fine-tune stats
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.keys(editingStandings).length > 0 && (
              <button
                onClick={saveAllModifiedStandings}
                disabled={batchSaveBusy}
                className="flex items-center gap-1.5 rounded-lg border border-amber-500/50 bg-amber-500/20 px-3.5 py-1.5 font-mono text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition-all shadow-[0_0_15px_rgba(245,158,11,0.25)]"
              >
                <span>💾</span>
                <span>{batchSaveBusy ? "Saving All…" : `Save All Changes (${Object.keys(editingStandings).length})`}</span>
              </button>
            )}
            <span className="font-mono text-xs text-zinc-400 bg-night-800 px-3 py-1.5 rounded-lg border border-night-700">
              {sortedAndFilteredTeams.length} {sortedAndFilteredTeams.length === 1 ? "Team" : "Teams"}
            </span>
          </div>
        </div>

        {/* CONTROLS BAR: DIVISION TABS + SEARCH */}
        <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-night-850 p-3 rounded-xl border border-night-800">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAdminDivision("all")}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-colors ${
                adminDivision === "all"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : "bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              All Divisions ({teams.length})
            </button>
            <button
              onClick={() => setAdminDivision("boys")}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-colors ${
                adminDivision === "boys"
                  ? "bg-blue-600/20 text-blue-300 border border-blue-500/40"
                  : "bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              👦 Boys ({boysCount})
            </button>
            <button
              onClick={() => setAdminDivision("girls")}
              className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-colors ${
                adminDivision === "girls"
                  ? "bg-pink-600/20 text-pink-300 border border-pink-500/40"
                  : "bg-night-800 text-zinc-400 hover:text-white"
              }`}
            >
              👧 Girls ({girlsCount})
            </button>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Search team in manager…"
              value={standingsSearch}
              onChange={(e) => setStandingsSearch(e.target.value)}
              className="input !py-1 !text-xs w-full"
            />
          </div>
        </div>

        {batchSaveMsg && (
          <div className="mt-3 rounded-lg border border-green-500/40 bg-green-500/10 px-3 py-2 font-mono text-xs text-green-300">
            {batchSaveMsg}
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[850px] text-left font-mono text-xs">
            <thead>
              <tr className="border-b border-night-700 bg-night-800 text-[10px] font-bold uppercase text-zinc-400">
                <th className="py-3 px-3 w-28">Order / Pos</th>
                <th className="py-3 px-3">Team</th>
                <th className="py-3 px-2 text-center w-28">Division</th>
                <th className="py-3 px-2 text-center w-20">Points</th>
                <th className="py-3 px-2 text-center w-16">Wins</th>
                <th className="py-3 px-2 text-center w-16">Losses</th>
                <th className="py-3 px-2 text-center w-16">Draws</th>
                <th className="py-3 px-2 text-center w-20">Maps Won</th>
                <th className="py-3 px-2 text-center w-20">Maps Lost</th>
                <th className="py-3 px-3 text-right w-24">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-night-800">
              {sortedAndFilteredTeams.map((t, idx) => {
                const currentEdit = editingStandings[t.id] ?? {};
                const pts = currentEdit.points ?? t.points;
                const w = currentEdit.wins ?? t.wins;
                const l = currentEdit.losses ?? t.losses;
                const d = currentEdit.draws ?? t.draws;
                const mw = currentEdit.maps_won ?? t.maps_won;
                const ml = currentEdit.maps_lost ?? t.maps_lost;
                const cat = currentEdit.category ?? t.category ?? "boys";
                const isModified = Object.keys(currentEdit).length > 0;
                const busy = standingsBusy[t.id] ?? false;

                return (
                  <tr key={t.id} className="hover:bg-night-850 transition-colors">
                    {/* ORDER / POSITION CONTROL COLUMN */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveTeamPosition(t.id, "up")}
                            disabled={idx === 0}
                            className="rounded bg-night-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-ember-500 hover:text-white transition-colors disabled:opacity-30"
                            title="Move team position UP"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            onClick={() => moveTeamPosition(t.id, "down")}
                            disabled={idx === sortedAndFilteredTeams.length - 1}
                            className="rounded bg-night-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300 hover:bg-ember-500 hover:text-white transition-colors disabled:opacity-30"
                            title="Move team position DOWN"
                          >
                            ▼
                          </button>
                        </div>
                        <input
                          type="number"
                          min={1}
                          placeholder={String(idx + 1)}
                          value={t.display_order ?? idx + 1}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value === "" ? idx + 1 : Number(e.target.value);
                            changeTeamPosition(t.id, val);
                          }}
                          className="input !py-1 !px-1.5 !text-xs font-bold text-center w-11"
                          title="Custom display rank position"
                        />
                      </div>
                    </td>

                    {/* TEAM NAME & LOGO */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2.5">
                        <TeamMark name={t.team_name} logoUrl={t.logo_url} size={28} />
                        <span className="font-bold text-white truncate max-w-[180px]">{t.team_name}</span>
                      </div>
                    </td>

                    {/* DIVISION SELECTOR TOGGLE */}
                    <td className="py-2 px-2 text-center">
                      <select
                        value={cat}
                        onChange={(e) => {
                          const newCat = e.target.value as "boys" | "girls";
                          changeTeamCategory(t.id, newCat);
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], category: newCat },
                          }));
                        }}
                        className={`input !py-1 !text-[11px] font-bold text-center rounded-lg ${
                          cat === "girls"
                            ? "border-pink-500/50 bg-pink-950/40 text-pink-300"
                            : "border-blue-500/50 bg-blue-950/40 text-blue-300"
                        }`}
                      >
                        <option value="boys">👦 Boys</option>
                        <option value="girls">👧 Girls</option>
                      </select>
                    </td>

                    {/* STATS INPUTS */}
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={pts ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], points: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs font-bold text-amber-400 text-center w-16 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={w ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], wins: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs font-bold text-green-400 text-center w-14 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={l ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], losses: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs font-bold text-red-400 text-center w-14 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={d ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], draws: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs font-bold text-zinc-400 text-center w-14 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={mw ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], maps_won: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs text-zinc-300 text-center w-14 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <input
                        type="number"
                        min={0}
                        placeholder="0"
                        value={ml ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setEditingStandings((p) => ({
                            ...p,
                            [t.id]: { ...p[t.id], maps_lost: e.target.value === "" ? ("" as any) : Number(e.target.value) },
                          }))
                        }
                        className="input !py-1 !text-xs text-zinc-300 text-center w-14 mx-auto"
                      />
                    </td>
                    <td className="py-2 px-3 text-right">
                      {isModified && (
                        <button
                          onClick={() => saveStandingsOverride(t.id)}
                          disabled={busy}
                          className="rounded bg-ember-600 px-3 py-1 font-bold text-white hover:bg-ember-500 text-xs transition-colors"
                        >
                          {busy ? "…" : "Save"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
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
      setMsg("Announcement published â€” every open tab just got it live.");
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
      <button className="btn-primary" disabled={busy}>{busy ? "Publishingâ€¦" : "Publish announcement"}</button>
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
/* TEAMS CONTROL â€” full management of all registered teams             */
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

function TeamsControlPanel({ onDownloadExcel, exporting }: { onDownloadExcel?: () => void; exporting?: boolean }) {
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
      {/* Top Header with Excel Export */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-night-800 pb-3">
        <div>
          <h2 className="font-display text-base font-bold uppercase text-white">Teams Registry</h2>
          <p className="font-mono text-xs text-zinc-400">Total registered teams: {teams.length}</p>
        </div>
        {onDownloadExcel && (
          <button
            onClick={onDownloadExcel}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-600/15 px-3.5 py-1.5 font-mono text-xs font-bold text-emerald-300 hover:bg-emerald-600/25 transition-all disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "📥 Export Excel (.xlsx)"}
          </button>
        )}
      </div>

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
          placeholder="Search by team name or captainâ€¦"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {actionMsg && <span className="font-mono text-xs text-green-400">{actionMsg}</span>}
      </div>

      {loading && <p className="py-10 text-center text-sm text-zinc-500 animate-pulse">Loading teamsâ€¦</p>}

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
                      Captain: {t.captain?.name ?? "â€”"} Â· {t.captain?.email ?? "â€”"}
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
                      âœ“ Approve
                    </button>
                  )}
                  {t.status !== "rejected" && (
                    <button
                      onClick={() => act(t.id, "reject")}
                      className="rounded border border-red-600/40 bg-red-600/10 px-3 py-1 font-mono text-xs font-bold text-red-400 hover:bg-red-600/20 transition-colors"
                    >
                      âœ• Reject
                    </button>
                  )}

                  <button
                    onClick={() => { setEditing(t); setEditName(t.team_name); setEditMsg(null); }}
                    className="rounded border border-night-600 bg-night-800 px-3 py-1 font-mono text-xs text-zinc-300 hover:border-night-500 hover:text-white transition-colors"
                  >
                    âœ Edit
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
                      {editBusy ? "Savingâ€¦" : "Save"}
                    </button>
                    <button
                      className="btn-ghost !py-2 !px-3 text-xs"
                      onClick={() => { setEditing(null); setEditMsg(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {editMsg && (
                    <p className={`mt-2 font-mono text-xs ${editMsg.startsWith("âœ“") ? "text-green-400" : "text-red-400"}`}>
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
                        {p.game_id && <span className="ml-1 text-zinc-600">Â· {p.game_id}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact + meta */}
              <div className="flex flex-wrap gap-x-6 gap-y-1 px-5 py-3 text-[11px] text-zinc-500">
                {t.phone    && <span>ðŸ“ž {t.phone}</span>}
                {t.email    && <span>âœ‰ {t.email}</span>}
                {t.discord  && <span>ðŸŽ® {t.discord}</span>}
                {t.whatsapp && <span>ðŸ’¬ {t.whatsapp}</span>}
                <span className="ml-auto">Registered {new Date(t.created_at).toLocaleDateString("en-IN")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
