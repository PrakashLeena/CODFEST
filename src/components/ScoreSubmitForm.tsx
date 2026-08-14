"use client";

import { useState } from "react";
import type { Match } from "@/lib/types";

/**
 * Captain's score report form. The server decides confirmed/disputed —
 * this form only submits one side's report with screenshot proof.
 */
export default function ScoreSubmitForm({
  match,
  ownTeamId,
  onSubmitted,
}: {
  match: Match;
  ownTeamId: string;
  onSubmitted: () => void;
}) {
  const isTeam1 = match.team1_id === ownTeamId;
  const ownSubmission = isTeam1 ? match.submission_team1 : match.submission_team2;
  const opponentSubmission = isTeam1 ? match.submission_team2 : match.submission_team1;
  const opponentName = (isTeam1 ? match.team2 : match.team1)?.team_name ?? "opponent";

  const [scoreOwn, setScoreOwn] = useState("");
  const [scoreOpp, setScoreOpp] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (match.status === "disputed") {
    return (
      <p className="mt-3 border border-purple-500/30 bg-purple-500/10 px-3 py-2 font-mono text-xs text-purple-300">
        Disputed — the submissions conflict and the match is under admin review.
      </p>
    );
  }

  if (ownSubmission) {
    return (
      <div className="mt-3 border border-amber-500/30 bg-amber-500/10 px-3 py-2 font-mono text-xs text-amber-300">
        Your report ({ownSubmission.score_own}–{ownSubmission.score_opponent}) is in.{" "}
        {opponentSubmission ? "Processing…" : `Waiting on ${opponentName} to submit.`}
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return setError("A screenshot of the final scoreboard is required");
    setBusy(true);
    setError(null);

    const form = new FormData();
    form.set("score_own", scoreOwn);
    form.set("score_opponent", scoreOpp);
    form.set("screenshot", file);

    const res = await fetch(`/api/matches/${match.id}/submit-score`, { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Submission failed");
    onSubmitted();
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 border border-night-700 bg-night-850 p-3">
      <p className="font-mono text-xs font-bold uppercase tracking-[0.1em] text-ember-400">// Report final score</p>
      {error && <p className="rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-300">{error}</p>}
      <div className="flex items-center gap-2">
        <input className="input !w-20 text-center" type="number" min={0} required placeholder="Us"
          value={scoreOwn} onFocus={(e) => e.target.select()} onChange={(e) => setScoreOwn(e.target.value)} />
        <span className="text-zinc-500">–</span>
        <input className="input !w-20 text-center" type="number" min={0} required placeholder="Them"
          value={scoreOpp} onFocus={(e) => e.target.select()} onChange={(e) => setScoreOpp(e.target.value)} />
        <span className="text-xs text-zinc-500">vs {opponentName}</span>
      </div>
      <div>
        <label className="label">Scoreboard screenshot (required)</label>
        <input className="input" type="file" accept="image/*" required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      <button className="btn-primary w-full !py-2 text-xs" disabled={busy}>
        {busy ? "Uploading…" : "Submit score report"}
      </button>
    </form>
  );
}
