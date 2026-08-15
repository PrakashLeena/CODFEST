import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/export/registrations
 * Downloads all team & member registration details as an Excel (.xlsx) file.
 *
 * Sheet 1 – "Team + Members"  : one row per team, member columns inlined (M1…M6)
 * Sheet 2 – "All Members"     : flat list, one row per player
 * Sheet 3 – "Team Rosters"    : grouped team-by-team readable view
 */
export async function GET() {
  try {
    const admin = await requireRole("admin");
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // ── 1. Fetch all data ──────────────────────────────────────────────
    const [
      { data: teams, error: tErr },
      { data: players, error: pErr },
      { data: users, error: uErr },
    ] = await Promise.all([
      db().from("teams").select("*").order("created_at", { ascending: false }),
      db().from("players").select("*").order("is_substitute"),
      db().from("users").select("id, name, email"),
    ]);

    if (tErr) {
      console.error("Teams query error:", tErr);
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }
    if (pErr) {
      console.error("Players query error:", pErr);
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }
    if (uErr) {
      console.error("Users query error (non-fatal):", uErr);
      // non-fatal – continue without captain name enrichment
    }

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    const playersByTeam = new Map<string, any[]>();

    for (const p of players ?? []) {
      if (p.team_id) {
        if (!playersByTeam.has(p.team_id)) playersByTeam.set(p.team_id, []);
        playersByTeam.get(p.team_id)!.push(p);
      }
    }

    const fmtDate = (raw: string | null) => {
      try {
        return raw ? new Date(raw).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—";
      } catch {
        return String(raw ?? "—");
      }
    };

    // ── SHEET 1: Team + Members (one row per team, members inlined) ────
    //  Columns: #, Team Name, Status, Captain Name, Captain Email,
    //           Phone, Discord, WhatsApp, Total Members, Registered On,
    //           [repeated for up to MAX_MEMBERS] M# Name, M# IGN, M# Email, M# Phone, M# IM No., M# Role
    const MAX_MEMBERS = 6;

    const teamMemberRows = (teams ?? []).map((t: any, i: number) => {
      const captain = t.captain_id ? userMap.get(t.captain_id) : null;
      const teamPlayers = playersByTeam.get(t.id) ?? [];
      const leaderName = captain?.name ?? t.captain_name ?? "—";
      const leaderEmail = captain?.email ?? t.email ?? "—";
      const leaderPhone = t.phone ?? "—";
      const leaderGameId = t.game_id ?? "—";
      const leaderIm = t.im_number ?? "—";

      const row: Record<string, string | number> = {
        "#": i + 1,
        "Team Name": t.team_name ?? "—",
        "Status": String(t.status ?? "pending").toUpperCase(),
        "Captain Name": leaderName,
        "Captain Email": leaderEmail,
        "Phone": leaderPhone,
        "Discord": t.discord ?? "—",
        "WhatsApp": t.whatsapp ?? "—",
        "Total Members": teamPlayers.length + 1,
        "Registered On": fmtDate(t.created_at),
      };

      // M1 is the Team Leader
      row["M1 Name"]   = leaderName;
      row["M1 IGN"]    = leaderGameId;
      row["M1 Email"]  = leaderEmail;
      row["M1 Phone"]  = leaderPhone;
      row["M1 IM No."] = leaderIm;
      row["M1 Role"]   = "Leader (Captain)";

      // Inline member columns M2…M6
      for (let m = 1; m < MAX_MEMBERS; m++) {
        const p = teamPlayers[m - 1];
        const prefix = `M${m + 1}`;
        if (p) {
          row[`${prefix} Name`]   = p.player_name ?? "—";
          row[`${prefix} IGN`]    = p.game_id ?? "—";
          row[`${prefix} Email`]  = p.email ?? "—";
          row[`${prefix} Phone`]  = p.phone ?? "—";
          row[`${prefix} IM No.`] = p.im_number ?? "—";
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

    // ── SHEET 2: All Members – flat list ──────────────────────────────
    const memberRows: Record<string, string | number>[] = [];
    let mIdx = 1;

    for (const t of teams ?? []) {
      const captain = t.captain_id ? userMap.get(t.captain_id) : null;
      const teamPlayers = playersByTeam.get(t.id) ?? [];
      const leaderName = captain?.name ?? t.captain_name ?? "—";
      const leaderEmail = captain?.email ?? t.email ?? "—";

      // 1st member: Team Leader
      memberRows.push({
        "#": mIdx++,
        "Team Name": t.team_name ?? "—",
        "Team Status": String(t.status ?? "pending").toUpperCase(),
        "Member Name": leaderName,
        "In-Game ID (IGN)": t.game_id ?? "—",
        "Email": leaderEmail,
        "Phone": t.phone ?? "—",
        "IM Number": t.im_number ?? "—",
        "Role": "Leader (Captain)",
      });

      // Remaining members
      for (const p of teamPlayers) {
        memberRows.push({
          "#": mIdx++,
          "Team Name": t.team_name ?? "—",
          "Team Status": String(t.status ?? "pending").toUpperCase(),
          "Member Name": p.player_name ?? "—",
          "In-Game ID (IGN)": p.game_id ?? "—",
          "Email": p.email ?? "—",
          "Phone": p.phone ?? "—",
          "IM Number": p.im_number ?? "—",
          "Role": p.is_substitute ? "Substitute" : "Main Roster",
        });
      }
    }

    // ── SHEET 3: Team Rosters – grouped readable view ─────────────────
    const rosterRows: Record<string, string>[] = [];

    for (const t of teams ?? []) {
      const captain = t.captain_id ? userMap.get(t.captain_id) : null;
      const teamPlayers = playersByTeam.get(t.id) ?? [];
      const leaderName = captain?.name ?? t.captain_name ?? "—";
      const leaderEmail = captain?.email ?? t.email ?? "—";

      // Team header row
      rosterRows.push({
        "Team": `▶  ${String(t.team_name).toUpperCase()}`,
        "Status": String(t.status ?? "pending").toUpperCase(),
        "Captain": leaderName ? `${leaderName} (${leaderEmail})` : t.email || "—",
        "Phone": t.phone || "—",
        "Discord": t.discord || "—",
        "#": "",
        "Member Name": "",
        "IGN": "",
        "Member Email": "",
        "Member Phone": "",
        "IM Number": "",
        "Role": "",
      });

      // 1. Leader row as #1
      rosterRows.push({
        "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
        "#": "1",
        "Member Name": leaderName,
        "IGN": t.game_id || "—",
        "Member Email": leaderEmail,
        "Member Phone": t.phone || "—",
        "IM Number": t.im_number || "—",
        "Role": "Leader (Captain)",
      });

      // 2. Member rows
      teamPlayers.forEach((p, pIdx) => {
        rosterRows.push({
          "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
          "#": String(pIdx + 2),
          "Member Name": p.player_name ?? "—",
          "IGN": p.game_id || "—",
          "Member Email": p.email || "—",
          "Member Phone": p.phone || "—",
          "IM Number": p.im_number || "—",
          "Role": p.is_substitute ? "Substitute" : "Main Roster",
        });
      });

      // Blank spacer row
      rosterRows.push({
        "Team": "", "Status": "", "Captain": "", "Phone": "", "Discord": "",
        "#": "", "Member Name": "", "IGN": "", "Member Email": "",
        "Member Phone": "", "IM Number": "", "Role": "",
      });
    }

    // ── Build Workbook ─────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // Sheet 1 – Team + Members
    const wsTeamMembers = XLSX.utils.json_to_sheet(
      teamMemberRows.length
        ? teamMemberRows
        : [{ "#": 1, "Team Name": "No teams registered yet" }]
    );
    const baseCols = [
      { wch: 4 },  // #
      { wch: 26 }, // Team Name
      { wch: 12 }, // Status
      { wch: 24 }, // Captain Name
      { wch: 30 }, // Captain Email
      { wch: 16 }, // Phone
      { wch: 18 }, // Discord
      { wch: 16 }, // WhatsApp
      { wch: 14 }, // Total Members
      { wch: 22 }, // Registered On
    ];
    const memberCols = Array.from({ length: MAX_MEMBERS }, () => [
      { wch: 24 }, // Name
      { wch: 20 }, // IGN
      { wch: 28 }, // Email
      { wch: 16 }, // Phone
      { wch: 16 }, // IM No.
      { wch: 12 }, // Role
    ]).flat();
    wsTeamMembers["!cols"] = [...baseCols, ...memberCols];
    XLSX.utils.book_append_sheet(wb, wsTeamMembers, "Team + Members");

    // Sheet 2 – All Members
    const wsMembers = XLSX.utils.json_to_sheet(
      memberRows.length
        ? memberRows
        : [{ "#": 1, "Team Name": "No members registered yet" }]
    );
    wsMembers["!cols"] = [
      { wch: 4 },  // #
      { wch: 26 }, // Team Name
      { wch: 14 }, // Team Status
      { wch: 26 }, // Member Name
      { wch: 22 }, // IGN
      { wch: 30 }, // Email
      { wch: 16 }, // Phone
      { wch: 16 }, // IM Number
      { wch: 14 }, // Role
    ];
    XLSX.utils.book_append_sheet(wb, wsMembers, "All Members");

    // Sheet 3 – Team Rosters
    const wsRosters = XLSX.utils.json_to_sheet(rosterRows);
    wsRosters["!cols"] = [
      { wch: 30 }, // Team
      { wch: 12 }, // Status
      { wch: 34 }, // Captain
      { wch: 16 }, // Phone
      { wch: 18 }, // Discord
      { wch: 4 },  // #
      { wch: 26 }, // Member Name
      { wch: 20 }, // IGN
      { wch: 28 }, // Member Email
      { wch: 16 }, // Member Phone
      { wch: 16 }, // IM Number
      { wch: 14 }, // Role
    ];
    XLSX.utils.book_append_sheet(wb, wsRosters, "Team Rosters");

    // ── Serialize & return ─────────────────────────────────────────────
    const arrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const uint8 = new Uint8Array(arrayBuffer);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const filename = `CODFEST_Teams_and_Members_${dateStr}.xlsx`;

    return new Response(uint8, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("Export registrations API error:", err);
    return NextResponse.json(
      { error: "Failed to generate Excel file", details: err?.message || String(err) },
      { status: 500 }
    );
  }
}

