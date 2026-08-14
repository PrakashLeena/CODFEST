import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?/);
      if (match) {
        let value = match[2] || "";
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[match[1]] = value.trim();
      }
    }
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function run() {
  console.log("Fetching teams, members, and captains from Supabase…");

  const [
    { data: teams, error: tErr },
    { data: players, error: pErr },
    { data: users, error: uErr },
  ] = await Promise.all([
    supabase.from("teams").select("*").order("created_at", { ascending: false }),
    supabase.from("players").select("*").order("is_substitute"),
    supabase.from("users").select("id, name, email"),
  ]);

  if (tErr) { console.error("Error fetching teams:", tErr.message); process.exit(1); }
  if (pErr) { console.error("Error fetching players:", pErr.message); process.exit(1); }
  if (uErr) { console.warn("Warning – users fetch failed (captain names may be missing):", uErr.message); }

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  const playersByTeam = new Map();

  for (const p of players ?? []) {
    if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
    playersByTeam.get(p.team_id).push(p);
  }

  console.log(`Fetched ${teams?.length ?? 0} teams and ${players?.length ?? 0} players.`);

  const fmtDate = (raw) => {
    try { return raw ? new Date(raw).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"; }
    catch { return String(raw ?? "—"); }
  };

  // ── SHEET 1: Team + Members (one row per team, M1–M6 inlined) ────────
  const MAX_MEMBERS = 6;

  const teamMemberRows = (teams ?? []).map((t, i) => {
    const captain = t.captain_id ? userMap.get(t.captain_id) : null;
    const teamPlayers = playersByTeam.get(t.id) ?? [];

    const row = {
      "#": i + 1,
      "Team Name": t.team_name || "—",
      "Status": String(t.status || "pending").toUpperCase(),
      "Captain Name": captain?.name || t.captain_name || "—",
      "Captain Email": captain?.email || t.email || "—",
      "Phone": t.phone || "—",
      "Discord": t.discord || "—",
      "WhatsApp": t.whatsapp || "—",
      "Total Members": teamPlayers.length,
      "Registered On": fmtDate(t.created_at),
    };

    for (let m = 0; m < MAX_MEMBERS; m++) {
      const p = teamPlayers[m];
      const prefix = `M${m + 1}`;
      if (p) {
        row[`${prefix} Name`]   = p.player_name || "—";
        row[`${prefix} IGN`]    = p.game_id || "—";
        row[`${prefix} Email`]  = p.email || "—";
        row[`${prefix} Phone`]  = p.phone || "—";
        row[`${prefix} IM No.`] = p.im_number || "—";
        row[`${prefix} Role`]   = p.is_substitute ? "Substitute" : "Main";
      } else {
        row[`${prefix} Name`]   = "";
        row[`${prefix} IGN`]    = "";
        row[`${prefix} Email`]  = "";
        row[`${prefix} Phone`]  = "";
        row[`${prefix} IM No.`] = "";
        row[`${prefix} Role`]   = "";
      }
    }

    return row;
  });

  // ── SHEET 2: All Members – flat list ──────────────────────────────────
  const memberRows = [];
  let mIdx = 1;

  for (const t of teams ?? []) {
    const teamPlayers = playersByTeam.get(t.id) ?? [];
    for (const p of teamPlayers) {
      memberRows.push({
        "#": mIdx++,
        "Team Name": t.team_name || "—",
        "Team Status": String(t.status || "pending").toUpperCase(),
        "Member Name": p.player_name || "—",
        "In-Game ID (IGN)": p.game_id || "—",
        "Email": p.email || "—",
        "Phone": p.phone || "—",
        "IM Number": p.im_number || "—",
        "Role": p.is_substitute ? "Substitute" : "Main Roster",
      });
    }
  }

  // ── SHEET 3: Team Rosters – grouped readable view ─────────────────────
  const rosterRows = [];

  for (const t of teams ?? []) {
    const captain = t.captain_id ? userMap.get(t.captain_id) : null;
    const teamPlayers = playersByTeam.get(t.id) ?? [];

    rosterRows.push({
      "Team": `▶  ${String(t.team_name).toUpperCase()}`,
      "Status": String(t.status || "pending").toUpperCase(),
      "Captain": captain?.name ? `${captain.name} (${captain.email})` : (t.email || "—"),
      "Phone": t.phone || "—",
      "Discord": t.discord || "—",
      "#": "",
      "Member Name": "", "IGN": "", "Member Email": "", "Member Phone": "", "IM Number": "", "Role": "",
    });

    if (teamPlayers.length === 0) {
      rosterRows.push({
        "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
        "#": "", "Member Name": "— no players registered yet —",
        "IGN": "", "Member Email": "", "Member Phone": "", "IM Number": "", "Role": "",
      });
    } else {
      teamPlayers.forEach((p, pIdx) => {
        rosterRows.push({
          "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
          "#": String(pIdx + 1),
          "Member Name": p.player_name || "—",
          "IGN": p.game_id || "—",
          "Member Email": p.email || "—",
          "Member Phone": p.phone || "—",
          "IM Number": p.im_number || "—",
          "Role": p.is_substitute ? "Substitute" : "Main Roster",
        });
      });
    }

    // Spacer
    rosterRows.push({
      "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
      "#": "", "Member Name": "", "IGN": "", "Member Email": "", "Member Phone": "", "IM Number": "", "Role": "",
    });
  }

  // ── Build Workbook ─────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  // Sheet 1
  const wsTeamMembers = XLSX.utils.json_to_sheet(
    teamMemberRows.length ? teamMemberRows : [{ "#": 1, "Team Name": "No teams found" }]
  );
  const baseCols = [
    { wch: 4 }, { wch: 26 }, { wch: 12 }, { wch: 24 }, { wch: 30 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 22 },
  ];
  const memberCols = Array.from({ length: MAX_MEMBERS }, () => [
    { wch: 24 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 12 },
  ]).flat();
  wsTeamMembers["!cols"] = [...baseCols, ...memberCols];
  XLSX.utils.book_append_sheet(wb, wsTeamMembers, "Team + Members");

  // Sheet 2
  const wsMembers = XLSX.utils.json_to_sheet(
    memberRows.length ? memberRows : [{ "#": 1, "Team Name": "No members found" }]
  );
  wsMembers["!cols"] = [
    { wch: 4 }, { wch: 26 }, { wch: 14 }, { wch: 26 }, { wch: 22 },
    { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsMembers, "All Members");

  // Sheet 3
  const wsRosters = XLSX.utils.json_to_sheet(rosterRows);
  wsRosters["!cols"] = [
    { wch: 30 }, { wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 18 },
    { wch: 4 }, { wch: 26 }, { wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRosters, "Team Rosters");

  const outFileName = "CODFEST_Registered_Teams_and_Members.xlsx";
  const outPath = path.resolve(process.cwd(), outFileName);
  XLSX.writeFile(wb, outPath);

  console.log(`\n========================================`);
  console.log(` SUCCESS! Excel export generated.`);
  console.log(` File: ${outPath}`);
  console.log(` Total Teams:   ${teams?.length ?? 0}`);
  console.log(` Total Members: ${players?.length ?? 0}`);
  console.log(` Sheets: "Team + Members" | "All Members" | "Team Rosters"`);
  console.log(`========================================\n`);
}

run().catch((err) => {
  console.error("Export script error:", err);
  process.exit(1);
});
