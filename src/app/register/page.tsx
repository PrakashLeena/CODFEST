"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

interface MemberRow {
  member_name: string;
  email: string;
  phone: string;
  im_number: string;
  game_id: string;
}

const emptyMember = (): MemberRow => ({ member_name: "", email: "", phone: "", im_number: "", game_id: "" });

/** Validates Sri Lanka mobile: +94 followed by 9 digits */
function validatePhone(v: string): string {
  if (!v) return "";
  if (!/^\+94\d{9}$/.test(v)) return "Format: +94 XXX XXX XXX (9 digits after +94)";
  return "";
}

/** Validates Gmail address */
function validateEmail(v: string): string {
  if (!v) return "";
  if (!v.toLowerCase().endsWith("@gmail.com")) return "Must be a @gmail.com address";
  return "";
}

/** Validates IM number: IM/YYYY/NNN */
function validateIm(v: string): string {
  if (!v) return "";
  if (!/^IM\/\d{4}\/\d{3}$/.test(v)) return "Format: IM/0000/000 (e.g. IM/2024/123)";
  return "";
}

function memberFromPlayer(p: any): MemberRow {
  return {
    member_name: p.player_name ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    im_number: p.im_number ?? "",
    game_id: p.game_id ?? "",
  };
}

/** Progress bar for the two-step flow. */
function StepBar({ step }: { step: 1 | 2 }) {
  const steps = ["[01] VERIFY EMAIL", "[02] REGISTER SQUAD"];
  return (
    <div className="mt-6 flex gap-2">
      {steps.map((label, i) => (
        <div key={label} className="flex-1">
          <p className={`font-mono text-xs ${i < step ? "text-ember-400" : "text-zinc-400"}`}>
            {label}
          </p>
          <div
            className={`mt-1 h-2 w-full ${
              i < step ? "bg-ember-400 shadow-glowSm" : "border border-night-700 bg-night-800"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Step 1 sub-states ────────────────────────────────────────────────────────
// "email"     → only the email field is shown (initial landing)
// "new"       → new user: show name + IM number + email (pre-filled, locked)
// "returning" → returning leader with no team: show OTP-request button only
// "otp"       → OTP entry form
type Step1State = "email" | "new" | "returning" | "otp";

export default function RegisterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // ── Step 1 state ──
  const [step1, setStep1] = useState<Step1State>("email");
  const [emailInput, setEmailInput] = useState("");
  const [checkingEmail, setCheckingEmail] = useState(false);
  // Full details (name + IM) — only needed for new users
  const [leaderName, setLeaderName] = useState("");
  const [leaderIm, setLeaderIm] = useState("");
  // OTP
  const [pendingVerify, setPendingVerify] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  // ── Step 2 state ──
  const [teamName, setTeamName] = useState("");
  const [captainPhone, setCaptainPhone] = useState("");
  const [captainGameId, setCaptainGameId] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([emptyMember(), emptyMember(), emptyMember(), emptyMember()]);
  const [agreed, setAgreed] = useState(false);

  // Edit mode — captain already has a team
  const [editMode, setEditMode] = useState(false);
  const [existingTeamId, setExistingTeamId] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);

  // UI state
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Prevent flash: wait until we've checked the team before rendering Step 2
  const [sessionChecked, setSessionChecked] = useState(false);
  // Guard: run the session check exactly ONCE after NextAuth resolves.
  // Using a ref (not state) so it doesn't trigger re-renders.
  const hasChecked = useRef(false);

  /* ─── Session check: allow access for 1 hour after OTP verification ──── */
  useEffect(() => {
    // Wait for NextAuth to resolve.
    if (status === "loading") return;
    // Run ONCE only — the ref prevents re-running when signOut/signIn change
    // status mid-session, which was causing the rapid OTP loop.
    if (hasChecked.current) return;
    hasChecked.current = true;

    if (!session) {
      setSessionChecked(true);
      return;
    }

    // Read the timestamp written to sessionStorage after OTP verification.
    // sessionStorage persists across refreshes (same tab) but clears on tab close.
    const ONE_HOUR = 60 * 60 * 1000;
    const raw = sessionStorage.getItem("captainVerifiedAt");
    const verifiedAt = raw ? parseInt(raw, 10) : 0;
    const withinWindow = Date.now() - verifiedAt < ONE_HOUR;

    if (!withinWindow) {
      // ⏰ Session older than 1 hour (or no timestamp) → sign out + re-verify
      const email = session.user?.email ?? "";
      sessionStorage.removeItem("captainVerifiedAt");
      signOut({ redirect: false }).then(() => {
        if (email) {
          setEmailInput(email);
          setStep1("returning");
        }
        setSessionChecked(true);
      });
      return;
    }

    // Within 1-hour window -> check team status
    fetch("/api/teams/my")
      .then((r) => r.json())
      .then((json) => {
        if (json.user?.name && json.user.name !== "leader") {
          setLeaderName(json.user.name);
        } else if (session.user?.name && session.user.name !== "leader") {
          setLeaderName(session.user.name);
        }
        if (json.team) {
          setExistingTeamId(json.team.id);
          setTeamName(json.team.team_name ?? "");
          setCaptainPhone(json.team.phone ?? "");
          setCaptainGameId(json.team.game_id ?? "");
          if (json.players?.length) {
            setMembers(json.players.map(memberFromPlayer));
          }
          setEditMode(true);
        }
        // No team yet but within 1-hour window → show registration form
        setSessionChecked(true);
      })
      .catch(() => setSessionChecked(true));
  }, [status]); // depends on status so it fires when NextAuth resolves

  /* ─── Step 1a: check email → branch to new / returning ─── */
  async function checkEmail(e: React.FormEvent) {
    e.preventDefault();
    const email = emailInput.trim().toLowerCase();
    if (!email) return;
    setCheckingEmail(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
      const json = await res.json();

      if (!json.exists) {
        // Brand new — ask for name + IM number
        setStep1("new");
      } else if (json.hasTeam) {
        // Has a team already — they should just log in via email to edit
        setStep1("returning");
      } else {
        // Verified captain, no team yet — skip name/IM, just send OTP
        setStep1("returning");
      }
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setCheckingEmail(false);
    }
  }

  /* ─── Step 1b: send OTP (new user with name + IM) ─── */
  async function startOtpNew(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: leaderName, email: emailInput.trim() }),
      });
      const text = await res.text();
      let json: { error?: string; needsVerification?: boolean; message?: string } = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }

      if (!res.ok && !json.needsVerification) {
        setError(json.error ?? "Could not start registration");
        return;
      }
      if (json.message) setInfo(json.message);
      setPendingVerify(emailInput.trim().toLowerCase());
      setOtp(process.env.NEXT_PUBLIC_OTP_TEST_MODE === "true" ? "000000" : "");
      setStep1("otp");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 1b: send OTP (returning leader — email only) ─── */
  async function startOtpReturning(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      // We pass a dummy name so the schema validates — the server ignores it for verified users
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "leader", email: emailInput.trim() }),
      });
      const text = await res.text();
      let json: { error?: string; needsVerification?: boolean; message?: string; returning?: boolean } = {};
      try { json = text ? JSON.parse(text) : {}; } catch { /* ignore */ }

      if (!res.ok && !json.needsVerification) {
        setError(json.error ?? "Could not send OTP");
        return;
      }
      if (json.message) setInfo(json.message);
      setPendingVerify(emailInput.trim().toLowerCase());
      setOtp(process.env.NEXT_PUBLIC_OTP_TEST_MODE === "true" ? "000000" : "");
      setStep1("otp");
    } catch {
      setError("Network error — could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 1: verify OTP ─── */
  async function verifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingVerify) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const signed = await signIn("credentials", {
        email: pendingVerify,
        otp,
        redirect: false,
      });
      if (signed?.error) {
        const map: Record<string, string> = {
          OTP_EXPIRED: "OTP expired. Request a new code.",
          INVALID_OTP: "Invalid OTP. Check the code and try again.",
        };
        setError(map[signed.error] ?? "Invalid OTP");
        return;
      }
      // ⏰ Stamp verification time — session is valid for 1 hour from now.
      sessionStorage.setItem("captainVerifiedAt", Date.now().toString());
      setEmailInput("");
      setPendingVerify(null);
      setStep1("email");     // reset step state
      setSessionChecked(true); // skip the mount-time check (already done)
      // Trigger team check immediately to move to Step 2
      fetch("/api/teams/my")
        .then((r) => r.json())
        .then((json) => {
          if (json.user?.name && json.user.name !== "leader") {
            setLeaderName(json.user.name);
          }
          if (json.team) {
            setExistingTeamId(json.team.id);
            setTeamName(json.team.team_name ?? "");
            setCaptainPhone(json.team.phone ?? "");
            setCaptainGameId(json.team.game_id ?? "");
            if (json.players?.length) setMembers(json.players.map(memberFromPlayer));
            setEditMode(true);
          }
        })
        .catch(() => {});
    } catch {
      setError("Could not verify OTP");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 1: resend OTP ─── */
  async function resendVerification() {
    if (!pendingVerify) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingVerify }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "Could not resend OTP");
      else setInfo(json.message ?? "New OTP sent");
    } catch {
      setError("Could not resend OTP");
    } finally {
      setBusy(false);
    }
  }

  /* ─── Step 2: register team ─── */
  async function registerTeam(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agreed) return setError("You must accept the rules and code of conduct");
    if (!leaderName.trim()) return setError("Leader's full name is required");
    if (leaderIm.trim() && validateIm(leaderIm)) return setError("Leader's IM number is invalid");
    if (validatePhone(captainPhone)) return setError("Leader's mobile number is invalid");
    if (!captainGameId.trim()) return setError("Leader's Gaming ID is required");
    if (members.some((m) => !m.member_name)) return setError("Every player needs a name");
    if (members.some((m) => !m.game_id.trim())) return setError("Every player needs a Gaming ID");
    if (members.some((m) => validatePhone(m.phone))) return setError("One or more members have an invalid mobile number");
    if (members.some((m) => validateIm(m.im_number))) return setError("One or more members have an invalid IM number");
    if (members.some((m) => validateEmail(m.email))) return setError("One or more members have an invalid email address");
    setBusy(true);

    const payload = {
      team_name: teamName,
      phone: captainPhone,
      game_id: captainGameId.trim(),
      captain_name: leaderName.trim(),
      email: session?.user?.email ?? emailInput.trim(),
      agreed: true,
      players: members.map((m) => ({
        player_name: m.member_name,
        email: m.email,
        phone: m.phone,
        im_number: m.im_number,
        game_id: m.game_id.trim(),
        is_substitute: false,
      })),
    };

    const form = new FormData();
    form.set("payload", JSON.stringify(payload));
    if (logo) form.set("logo", logo);

    const res = await fetch("/api/teams/register", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Team registration failed");
    setDone(true);
  }

  /* ─── Edit mode: save changes ─── */
  async function saveTeamEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!existingTeamId) return;
    setError(null);
    if (!leaderName.trim()) return setError("Leader's full name is required");
    if (leaderIm.trim() && validateIm(leaderIm)) return setError("Leader's IM number is invalid");
    if (validatePhone(captainPhone)) return setError("Leader's mobile number is invalid");
    if (!captainGameId.trim()) return setError("Leader's Gaming ID is required");
    if (members.some((m) => !m.member_name)) return setError("Every player needs a name");
    if (members.some((m) => !m.game_id.trim())) return setError("Every player needs a Gaming ID");
    if (members.some((m) => validatePhone(m.phone))) return setError("One or more members have an invalid mobile number");
    if (members.some((m) => validateIm(m.im_number))) return setError("One or more members have an invalid IM number");
    if (members.some((m) => validateEmail(m.email))) return setError("One or more members have an invalid email address");
    setBusy(true);

    const body = {
      team_name: teamName,
      phone: captainPhone,
      game_id: captainGameId.trim(),
      captain_name: leaderName.trim(),
      players: members.map((m) => ({
        player_name: m.member_name,
        email: m.email,
        phone: m.phone,
        im_number: m.im_number,
        game_id: m.game_id.trim(),
        is_substitute: false,
      })),
    };

    const res = await fetch(`/api/teams/${existingTeamId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error ?? "Could not save changes");
    setEditSuccess(true);
    setError(null);
  }

  /* ───────────────── RENDER ───────────────────────────────────────────────── */

  if (status === "loading" || !sessionChecked) {
    return <p className="mt-20 text-center text-zinc-500">Loading…</p>;
  }

  /* ─── Success screen (new registration) ─── */
  if (done) {
    return (
      <div className="site-gutter mx-auto max-w-lg py-20 text-center">
        <p className="font-mono text-sm tracking-[0.1em] text-ember-400">// TRANSMISSION RECEIVED</p>
        <h1 className="section-title mt-3">Registration Submitted</h1>
        <p className="mt-3 text-zinc-400">
          Your squad is{" "}
          <strong className="text-amber-300">pending admin approval</strong>. Once approved, your
          team will appear on the Verified Squads page.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          You will be contacted via the email / phone you provided.
        </p>
      </div>
    );
  }

  /* ─── OTP verification screen ─── */
  if (step1 === "otp" && pendingVerify) {
    return (
      <div className="site-gutter mx-auto max-w-md py-16">
        <div className="border-l-4 border-l-ember-400 pl-4">
          <h1 className="section-title">Verify Email</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ember-500">
            // OTP_CLEARANCE
          </p>
        </div>
        <StepBar step={1} />
        <p className="mt-4 text-center text-sm text-zinc-500">
          Enter the 6-digit code sent to{" "}
          <strong className="text-ember-400">{pendingVerify}</strong>
        </p>
        {process.env.NEXT_PUBLIC_OTP_TEST_MODE === "true" && (
          <p className="mt-2 text-center font-mono text-xs text-amber-300">
            TEST MODE — use OTP <strong>000000</strong>
          </p>
        )}
        <form onSubmit={verifyOtp} className="card mt-8 space-y-4 p-6">
          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="border border-ember-600/40 bg-ember-600/10 px-3 py-2 font-mono text-xs text-ember-400">
              {info}
            </p>
          )}
          <div>
            <label className="label">One-time password (OTP)</label>
            <input
              className="input text-center font-mono text-2xl tracking-[0.4em]"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="••••••"
              required
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </div>
          <button className="btn-primary w-full" disabled={busy || otp.length !== 6}>
            {busy ? "Verifying…" : "Verify & Continue →"}
          </button>
          <button type="button" className="btn-ghost w-full" disabled={busy} onClick={resendVerification}>
            {busy ? "Sending…" : "Resend OTP"}
          </button>
          <button
            type="button"
            className="w-full text-center font-mono text-[11px] text-zinc-600 hover:text-zinc-400"
            onClick={() => { setStep1("email"); setError(null); setInfo(null); setPendingVerify(null); }}
          >
            ← Use a different email
          </button>
        </form>
      </div>
    );
  }

  /* ─── Step 1: email-only landing (initial check) ─── */
  if (!session && step1 === "email") {
    return (
      <div className="site-gutter mx-auto max-w-md py-16">
        <div className="border-l-4 border-l-ember-400 pl-4">
          <h1 className="section-title">Squad Registration</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ember-500">
            // TEAM LEADER — EMAIL VERIFICATION
          </p>
        </div>
        <StepBar step={1} />
        <p className="mt-4 text-center text-sm text-zinc-500">
          Only the <strong className="text-zinc-300">team leader</strong> registers.
          Enter your email to get started.
        </p>
        <form onSubmit={checkEmail} className="card mt-8 space-y-4 p-6">
          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {error}
            </p>
          )}
          <div>
            <label className="label">Leader&apos;s email</label>
            <input
              className={`input ${
                validateEmail(emailInput) ? "border-red-500/70 focus:border-red-500" : ""
              }`}
              placeholder="leader@gmail.com"
              type="email"
              required
              pattern="^[a-zA-Z0-9._%+\-]+@gmail\.com$"
              title="Must be a @gmail.com address"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
            />
            {validateEmail(emailInput) && (
              <p className="mt-1 font-mono text-[10px] text-red-400">{validateEmail(emailInput)}</p>
            )}
          </div>
          <button className="btn-primary w-full" disabled={checkingEmail}>
            {checkingEmail ? "Checking…" : "Continue →"}
          </button>
        </form>
      </div>
    );
  }

  /* ─── Step 1: new user — collect name + IM number ─── */
  if (!session && step1 === "new") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="border-l-4 border-l-ember-400 pl-4">
          <h1 className="section-title">Squad Registration</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ember-500">
            // NEW TEAM LEADER
          </p>
        </div>
        <StepBar step={1} />
        <p className="mt-4 text-center text-sm text-zinc-500">
          Fill in your details — we&apos;ll send a one-time code to verify your email.
        </p>
        <form onSubmit={startOtpNew} className="card mt-8 space-y-4 p-6">
          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {error}
            </p>
          )}
          {/* Email locked — already entered */}
          <div>
            <label className="label">Leader&apos;s email</label>
            <input
              className="input opacity-60 cursor-not-allowed"
              type="email"
              value={emailInput}
              readOnly
            />
          </div>
          <div>
            <label className="label">Full name</label>
            <input
              className="input"
              placeholder="FULL_NAME"
              required
              minLength={2}
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">IM Number</label>
            <input
              className={`input ${
                validateIm(leaderIm) ? "border-red-500/70 focus:border-red-500" : ""
              }`}
              placeholder="IM/0000/000"
              required
              maxLength={11}
              pattern="^IM\/\d{4}\/\d{3}$"
              title="Format: IM/0000/000 (e.g. IM/2024/123)"
              value={leaderIm}
              onChange={(e) => setLeaderIm(e.target.value)}
            />
            {validateIm(leaderIm) && (
              <p className="mt-1 font-mono text-[10px] text-red-400">{validateIm(leaderIm)}</p>
            )}
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending OTP…" : "Send OTP →"}
          </button>
          <button
            type="button"
            className="w-full text-center font-mono text-[11px] text-zinc-600 hover:text-zinc-400"
            onClick={() => { setStep1("email"); setError(null); }}
          >
            ← Change email
          </button>
        </form>
      </div>
    );
  }

  /* ─── Step 1: returning leader — OTP re-login ─── */
  if (!session && step1 === "returning") {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <div className="border-l-4 border-l-ember-400 pl-4">
          <h1 className="section-title">Welcome Back</h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ember-500">
            // RETURNING LEADER — OTP RE-LOGIN
          </p>
        </div>
        <StepBar step={1} />

        <div className="mt-4 border border-ember-400/30 bg-ember-600/10 px-4 py-3 font-mono text-xs text-ember-300">
          Your account was found for{" "}
          <strong className="text-ember-400">{emailInput}</strong>.
          Click below to receive a sign-in code and continue your registration.
        </div>

        <form onSubmit={startOtpReturning} className="card mt-6 space-y-4 p-6">
          {error && (
            <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
              {error}
            </p>
          )}
          {info && (
            <p className="border border-ember-600/40 bg-ember-600/10 px-3 py-2 font-mono text-xs text-ember-400">
              {info}
            </p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending OTP…" : "Send OTP to my email →"}
          </button>
          <button
            type="button"
            className="w-full text-center font-mono text-[11px] text-zinc-600 hover:text-zinc-400"
            onClick={() => { setStep1("email"); setError(null); setInfo(null); }}
          >
            ← Use a different email
          </button>
        </form>
      </div>
    );
  }

  /* ─── Shared team form (register OR edit) ─── */
  const isEdit = editMode && !!existingTeamId;
  const formTitle = isEdit ? "Edit Your Team" : "Team Registration";
  const formSubtitle = isEdit ? "// UPDATE SQUAD DETAILS" : "// SQUAD DETAILS";
  const submitLabel = isEdit ? "Save Changes" : "Submit Team Registration";
  const onSubmit = isEdit ? saveTeamEdit : registerTeam;

  return (
    <div className="site-gutter mx-auto max-w-2xl py-12">
      <div className="border-l-4 border-l-ember-400 pl-4">
        <h1 className="section-title">{formTitle}</h1>
        <p className="mt-1 font-mono text-xs uppercase tracking-[0.1em] text-ember-500">
          {formSubtitle}
        </p>
      </div>
      {!isEdit && <StepBar step={2} />}

      {/* Edit success banner */}
      {editSuccess && (
        <div className="mt-4 border border-green-500/40 bg-green-500/10 px-4 py-3 font-mono text-xs text-green-300">
          Changes saved successfully.
        </div>
      )}

      {isEdit && !editSuccess && (
        <div className="mt-4 border border-ember-400/30 bg-ember-600/10 px-4 py-3 font-mono text-xs text-ember-300">
          You&apos;re editing your existing team. Changes take effect immediately.
        </div>
      )}

      {!isEdit && (
        <ul className="card mt-4 list-inside list-disc p-4 text-sm text-zinc-400">
          <li>Only the team leader submits this form.</li>
          <li>Team name must be unique (max 30 characters).</li>
          <li>Add all team members — name, email, mobile, IM Number, and Gaming ID required.</li>
          <li>Real names only. Gaming ID must match your in-game profile.</li>
        </ul>
      )}

      <form onSubmit={onSubmit} className="card mt-6 space-y-6 p-6">
        {error && (
          <p className="border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
            {error}
          </p>
        )}

        {/* ── Leader details ── */}
        <div className="rounded border border-night-700/80 bg-night-900/60 p-4">
          <div className="mb-3 flex items-center justify-between border-b border-night-700/50 pb-2">
            <span className="font-mono text-xs uppercase tracking-widest text-ember-400">
              // TEAM LEADER DETAILS
            </span>
            <span className="rounded border border-ember-500/30 bg-ember-500/10 px-2 py-0.5 font-mono text-[10px] text-ember-300">
              Leader
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center justify-between">
                <label className="label">Leader&apos;s email</label>
                <span className="font-mono text-[10px] text-zinc-500">[Locked]</span>
              </div>
              <input
                className="input cursor-not-allowed border-night-700 bg-night-950/60 text-zinc-400 opacity-75"
                type="email"
                readOnly
                disabled
                value={session?.user?.email || emailInput}
              />
              <p className="mt-1 font-mono text-[10px] text-zinc-500">
                Email address is verified and cannot be changed.
              </p>
            </div>

            <div>
              <label className="label">Leader&apos;s full name</label>
              <input
                className="input"
                required
                minLength={2}
                placeholder="Real name"
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
              />
            </div>

            <div>
              <label className="label">Leader&apos;s IM Number</label>
              <input
                className={`input ${
                  leaderIm && validateIm(leaderIm) ? "border-red-500/70 focus:border-red-500" : ""
                }`}
                placeholder="IM/0000/000"
                maxLength={11}
                pattern="^IM\/\d{4}\/\d{3}$"
                title="Format: IM/0000/000 (e.g. IM/2024/123)"
                value={leaderIm}
                onChange={(e) => setLeaderIm(e.target.value)}
              />
              {leaderIm && validateIm(leaderIm) && (
                <p className="mt-1 font-mono text-[10px] text-red-400">{validateIm(leaderIm)}</p>
              )}
            </div>

            <div>
              <label className="label">Leader&apos;s mobile number</label>
              <input
                className={`input ${
                  validatePhone(captainPhone) ? "border-red-500/70 focus:border-red-500" : ""
                }`}
                required
                maxLength={13}
                placeholder="+94 XXX XXX XXX"
                value={captainPhone}
                onChange={(e) => {
                  let raw = e.target.value;
                  if (!raw.startsWith("+94")) {
                    raw = "+94" + raw.replace(/^\+?9?4?/, "").replace(/\D/g, "");
                  }
                  const prefix = "+94";
                  const digits = raw.slice(prefix.length).replace(/\D/g, "").slice(0, 9);
                  setCaptainPhone(prefix + digits);
                }}
              />
              {validatePhone(captainPhone) && (
                <p className="mt-1 font-mono text-[10px] text-red-400">{validatePhone(captainPhone)}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="label">Leader&apos;s Gaming ID</label>
              <input
                className="input"
                required
                placeholder="e.g. SniperKing#1234"
                value={captainGameId}
                onChange={(e) => setCaptainGameId(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* ── Team basics ── */}
        <div className="rounded border border-night-700/80 bg-night-900/60 p-4">
          <div className="mb-3 border-b border-night-700/50 pb-2">
            <span className="font-mono text-xs uppercase tracking-widest text-ember-400">
              // SQUAD DETAILS
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={isEdit ? "sm:col-span-2" : ""}>
              <label className="label">Team name</label>
              <input
                className="input"
                required
                maxLength={30}
                placeholder="SQUAD_NAME"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>
            {!isEdit && (
              <div>
                <label className="label">Team logo (optional, max 4 MB)</label>
                <input
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Members ── */}
        <div>
          <div className="flex items-center justify-between">
            <label className="label !mb-0">
              Team members{" "}
              <span className="text-zinc-500">(4 members, not including you)</span>
            </label>
          </div>

          <div className="mt-3 space-y-3">
            {members.map((m, i) => (
              <div
                key={i}
                className="relative rounded border border-night-700 bg-night-900 p-3"
              >
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                  Member {i + 1}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="label text-[11px]">Full name</label>
                    <input
                      className="input"
                      placeholder="Real name"
                      required
                      value={m.member_name}
                      onChange={(e) =>
                        setMembers(members.map((x, j) => (j === i ? { ...x, member_name: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <label className="label text-[11px]">Email address</label>
                    <input
                      className={`input ${
                        validateEmail(m.email) ? "border-red-500/70 focus:border-red-500" : ""
                      }`}
                      type="email"
                      required
                      pattern="^[a-zA-Z0-9._%+\-]+@gmail\.com$"
                      title="Must be a @gmail.com address"
                      placeholder="member@gmail.com"
                      value={m.email}
                      onChange={(e) =>
                        setMembers(members.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))
                      }
                    />
                    {validateEmail(m.email) && (
                      <p className="mt-1 font-mono text-[10px] text-red-400">{validateEmail(m.email)}</p>
                    )}
                  </div>
                  <div>
                    <label className="label text-[11px]">Mobile number</label>
                    <input
                      className={`input ${
                        validatePhone(m.phone) ? "border-red-500/70 focus:border-red-500" : ""
                      }`}
                      type="tel"
                      placeholder="+94 XXX XXX XXX"
                      required
                      maxLength={13}
                      value={m.phone}
                      onChange={(e) => {
                        // Always keep +94 prefix, only allow digits after it
                        let raw = e.target.value;
                        // Ensure it starts with +94
                        if (!raw.startsWith("+94")) {
                          raw = "+94" + raw.replace(/^\+?9?4?/, "").replace(/\D/g, "");
                        }
                        // Only keep +94 + up to 9 digits
                        const prefix = "+94";
                        const digits = raw.slice(prefix.length).replace(/\D/g, "").slice(0, 9);
                        setMembers(members.map((x, j) => (j === i ? { ...x, phone: prefix + digits } : x)));
                      }}
                    />
                    {validatePhone(m.phone) && (
                      <p className="mt-1 font-mono text-[10px] text-red-400">{validatePhone(m.phone)}</p>
                    )}
                  </div>
                  <div>
                    <label className="label text-[11px]">IM Number</label>
                    <input
                      className={`input ${
                        validateIm(m.im_number) ? "border-red-500/70 focus:border-red-500" : ""
                      }`}
                      placeholder="IM/0000/000"
                      required
                      maxLength={11}
                      pattern="^IM\/\d{4}\/\d{3}$"
                      title="Format: IM/0000/000 (e.g. IM/2024/123)"
                      value={m.im_number}
                      onChange={(e) =>
                        setMembers(members.map((x, j) => (j === i ? { ...x, im_number: e.target.value } : x)))
                      }
                    />
                    {validateIm(m.im_number) && (
                      <p className="mt-1 font-mono text-[10px] text-red-400">{validateIm(m.im_number)}</p>
                    )}
                  </div>
                  <div>
                    <label className="label text-[11px]">Gaming ID</label>
                    <input
                      className="input"
                      placeholder="e.g. SniperKing#1234"
                      required
                      value={m.game_id}
                      onChange={(e) =>
                        setMembers(members.map((x, j) => (j === i ? { ...x, game_id: e.target.value } : x)))
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Agreement (new registration only) ── */}
        {!isEdit && (
          <label className="flex items-start gap-3 text-sm text-zinc-400">
            <input
              type="checkbox"
              className="mt-1"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              We have read and agree to the tournament rules and code of conduct.
            </span>
          </label>
        )}

        <button className="btn-primary w-full" disabled={busy}>
          {busy ? (isEdit ? "Saving…" : "Submitting…") : submitLabel}
        </button>
      </form>
    </div>
  );
}
