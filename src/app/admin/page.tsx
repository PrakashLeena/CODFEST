"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import TeamMark from "@/components/TeamMark";
import { getSocket, useSocketEvents } from "@/hooks/useSocket";
import { ROUND_NAMES, type Match } from "@/lib/types";

const TABS = [
  "Registrations",
  "Fixtures",
  "Leaderboard",
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

  useSocketEvents(["team:registered"], () => {
    setAlert("A new team just registered — check Registrations.");
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
          <button onClick={() => setAlert(null)} className="ml-4 text-purple-300 hover:text-white">âœ•</button>
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
        {tab === "Registrations" && <RegistrationsPanel />}
        {tab === "Fixtures"      && <FixturesPanel />}
        {tab === "Leaderboard"   && <LeaderboardPanel />}
        {tab === "Announcements" && <AnnouncementsPanel />}
        {tab === "Audit log"     && <AuditPanel />}
        {tab === "Teams Control" && <TeamsControlPanel />}
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
                Phone: {t.phone ?? "â€”"} Â· Discord: {t.discord || "â€”"}
              </div>
              <div className="mt-2 text-xs text-zinc-500">
                Roster: {t.players?.map((p: any) => p.player_name).join(", ") || "â€”"}
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
/*  LEADERBOARD IMAGE PANEL                                            */
/* ================================================================== */

interface LeaderboardImage {
  id: string;
  title: string | null;
  image_url: string;
  created_at: string;
}

function LeaderboardPanel() {
  const [images, setImages]   = useState<LeaderboardImage[]>([]);
  const [title, setTitle]     = useState("");
  const [file, setFile]       = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState<string | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const fileRef               = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch("/api/admin/leaderboard-image")
      .then((r) => r.json())
      .then((j) => setImages(j.images ?? []));
  }, []);
  useEffect(load, [load]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f) {
      const url = URL.createObjectURL(f);
      setPreview(url);
    } else {
      setPreview(null);
    }
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Please select an image first."); return; }
    setBusy(true); setMsg(null); setError(null);
    const fd = new FormData();
    fd.append("image", file);
    fd.append("title", title);
    const res = await fetch("/api/admin/leaderboard-image", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg("✓ Image uploaded and now visible on the Leaderboard page.");
      setTitle(""); setFile(null); setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      load();
    } else {
      setError(json.error ?? "Upload failed.");
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this image from the leaderboard?")) return;
    await fetch("/api/admin/leaderboard-image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    load();
  }

  return (
    <div className="space-y-8">
      {/* Upload form */}
      <section>
        <h2 className="font-display text-lg font-bold uppercase text-white">
          Upload Score Screenshot
        </h2>
        <p className="mt-1 font-mono text-xs text-zinc-500">
          Take a screenshot of the scores and upload it here — it will instantly appear on the public Leaderboard page.
        </p>

        <form onSubmit={upload} className="card mt-4 max-w-2xl space-y-4 p-6">
          {msg   && <p className="rounded border border-green-600/30 bg-green-600/10 px-3 py-2 font-mono text-xs text-green-400">{msg}</p>}
          {error && <p className="rounded border border-red-600/30 bg-red-600/10 px-3 py-2 font-mono text-xs text-red-400">{error}</p>}

          <div>
            <label className="label">Caption / Title (optional)</label>
            <input
              className="input"
              placeholder="e.g. Round 2 Results — Group A"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <label className="label">Score Screenshot</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="block w-full cursor-pointer rounded border border-night-600 bg-night-800 px-3 py-2 text-sm text-zinc-300 file:mr-4 file:rounded file:border-0 file:bg-ember-600 file:px-4 file:py-1.5 file:text-xs file:font-bold file:uppercase file:text-white hover:file:bg-ember-500"
            />
          </div>

          {preview && (
            <div className="overflow-hidden rounded-lg border border-night-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Preview" className="max-h-72 w-full object-contain bg-night-900" />
              <p className="px-3 py-1.5 font-mono text-[10px] text-zinc-500">Preview</p>
            </div>
          )}

          <button className="btn-primary" disabled={busy || !file}>
            {busy ? "Uploading…" : "Upload to Leaderboard"}
          </button>
        </form>
      </section>

      {/* Existing images */}
      <section>
        <h2 className="font-display text-lg font-bold uppercase text-white">
          Published Images ({images.length})
        </h2>
        {images.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No images uploaded yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <div key={img.id} className="card overflow-hidden">
                <a href={img.image_url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.image_url}
                    alt={img.title ?? "Leaderboard screenshot"}
                    className="h-48 w-full object-contain bg-night-900"
                  />
                </a>
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      {img.title || <span className="text-zinc-500 italic">No title</span>}
                    </p>
                    <p className="font-mono text-[10px] text-zinc-600">
                      {new Date(img.created_at).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(img.id)}
                    className="rounded border border-red-600/30 bg-red-600/10 px-3 py-1 font-mono text-xs text-red-400 hover:bg-red-600/20 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
      setEditMsg("âœ“ Team name updated.");
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
