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
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
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
  console.log("Fetching registered teams, captains, and player rosters from Supabase...");

  const [{ data: teams, error: tErr }, { data: players, error: pErr }, { data: users, error: uErr }] = await Promise.all([
    supabase.from("teams").select("*").order("created_at", { ascending: false }),
    supabase.from("players").select("*"),
    supabase.from("users").select("id, name, email"),
  ]);

  if (tErr) {
    console.error("Error fetching teams:", tErr.message);
    process.exit(1);
  }

  const userMap = new Map((users ?? []).map((u) => [u.id, u]));
  const playersByTeam = new Map();

  for (const p of players ?? []) {
    if (!playersByTeam.has(p.team_id)) {
      playersByTeam.set(p.team_id, []);
    }
    playersByTeam.get(p.team_id).push(p);
  }

  console.log(`Successfully fetched ${teams?.length ?? 0} teams and ${players?.length ?? 0} registered players.`);

  // ──────────────────────────────────────────────
  // SHEET 1: TEAMS SUMMARY
  // ──────────────────────────────────────────────
  const teamsRows = (teams ?? []).map((t, idx) => {
    const captain = t.captain_id ? userMap.get(t.captain_id) : null;
    const teamPlayers = playersByTeam.get(t.id) ?? [];

    let regDate = "—";
    try {
      if (t.created_at) {
        regDate = new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      }
    } catch {
      regDate = String(t.created_at || "—");
    }

    return {
      "#": idx + 1,
      "Team Name": t.team_name || "—",
      Status: String(t.status || "pending").toUpperCase(),
      "Captain Name": captain?.name || t.captain_name || "—",
      "Captain Email": captain?.email || t.email || "—",
      "Contact Phone": t.phone || "—",
      Discord: t.discord || "—",
      WhatsApp: t.whatsapp || "—",
      "Total Members": teamPlayers.length,
      "Points": Number(t.points) || 0,
      "Wins": Number(t.wins) || 0,
      "Losses": Number(t.losses) || 0,
      "Draws": Number(t.draws) || 0,
      "Score / Maps Won": Number(t.maps_won) || 0,
      "Opp Score / Maps Lost": Number(t.maps_lost) || 0,
      "Registered On": regDate,
    };
  });

  // ──────────────────────────────────────────────
  // SHEET 2: ALL REGISTERED PLAYERS / MEMBERS
  // ──────────────────────────────────────────────
  const playerRows = [];
  let pIndex = 1;

  for (const t of teams ?? []) {
    const teamPlayers = playersByTeam.get(t.id) ?? [];
    for (const p of teamPlayers) {
      playerRows.push({
        "#": pIndex++,
        "Team Name": t.team_name || "—",
        "Team Status": String(t.status || "pending").toUpperCase(),
        "Player / Member Name": p.player_name || "—",
        "In-Game ID (IGN)": p.game_id || "—",
        "Player Email": p.email || "—",
        "Player Phone": p.phone || "—",
        "IM Number": p.im_number || "—",
        "Role": p.is_substitute ? "Substitute" : "Main Roster",
      });
    }
  }

  // ──────────────────────────────────────────────
  // SHEET 3: COMPLETE TEAM-BY-TEAM ROSTERS
  // ──────────────────────────────────────────────
  const rosterRows = [];
  for (const t of teams ?? []) {
    const captain = t.captain_id ? userMap.get(t.captain_id) : null;
    const teamPlayers = playersByTeam.get(t.id) ?? [];

    rosterRows.push({
      "Team": `TEAM: ${t.team_name.toUpperCase()}`,
      "Status": `[ ${String(t.status).toUpperCase()} ]`,
      "Captain / Contact": captain?.name ? `${captain.name} (${captain.email})` : (t.email || "—"),
      "Phone": t.phone || "—",
      "Member Name": "",
      "In-Game ID": "",
      "Member Email": "",
      "Member Phone": "",
      "Role": "",
    });

    if (teamPlayers.length === 0) {
      rosterRows.push({
        "Team": "",
        "Status": "",
        "Captain / Contact": "",
        "Phone": "",
        "Member Name": "No players registered yet",
        "In-Game ID": "",
        "Member Email": "",
        "Member Phone": "",
        "Role": "",
      });
    } else {
      teamPlayers.forEach((p, pIdx) => {
        rosterRows.push({
          "Team": "",
          "Status": "",
          "Captain / Contact": "",
          "Phone": "",
          "Member Name": `${pIdx + 1}. ${p.player_name}`,
          "In-Game ID": p.game_id || "—",
          "Member Email": p.email || "—",
          "Member Phone": p.phone || "—",
          "Role": p.is_substitute ? "Substitute" : "Main Roster",
        });
      });
    }

    // Spacer
    rosterRows.push({
      "Team": "", "Status": "", "Captain / Contact": "", "Phone": "",
      "Member Name": "", "In-Game ID": "", "Member Email": "", "Member Phone": "", "Role": ""
    });
  }

  // ──────────────────────────────────────────────
  // BUILD WORKBOOK
  // ──────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const wsTeams = XLSX.utils.json_to_sheet(teamsRows.length ? teamsRows : [{ "#": 1, "Team Name": "No teams found" }]);
  wsTeams["!cols"] = [
    { wch: 4 }, { wch: 28 }, { wch: 12 }, { wch: 24 }, { wch: 32 },
    { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
    { wch: 6 }, { wch: 8 }, { wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 24 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTeams, "Teams Summary");

  const wsPlayers = XLSX.utils.json_to_sheet(playerRows.length ? playerRows : [{ "#": 1, "Team Name": "No players found" }]);
  wsPlayers["!cols"] = [
    { wch: 4 }, { wch: 28 }, { wch: 14 }, { wch: 28 }, { wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 16 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsPlayers, "All Players");

  const wsRosters = XLSX.utils.json_to_sheet(rosterRows);
  wsRosters["!cols"] = [
    { wch: 32 }, { wch: 16 }, { wch: 36 }, { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 16 }
  ];
  XLSX.utils.book_append_sheet(wb, wsRosters, "Team Rosters");

  const outFileName = "CODFEST_Registered_Teams_and_Members.xlsx";
  const outPath = path.resolve(process.cwd(), outFileName);
  XLSX.writeFile(wb, outPath);

  console.log(`\n========================================`);
  console.log(` SUCCESS! Excel export generated.`);
  console.log(` File: ${outPath}`);
  console.log(` Total Teams: ${teams?.length ?? 0}`);
  console.log(` Total Members: ${players?.length ?? 0}`);
  console.log(`========================================\n`);
}

run().catch((err) => {
  console.error("Export script error:", err);
  process.exit(1);
});
