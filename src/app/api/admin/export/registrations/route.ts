import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/admin/export/registrations
 * Downloads all team registration details as an Excel (.xlsx) file.
 * Sheet 1: Teams summary | Sheet 2: All Players (flat)
 */
export async function GET() {
  try {
    const admin = await requireRole("admin");
    if (!admin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // 1. Fetch teams, players, and users
    const [{ data: teams, error: tErr }, { data: players, error: pErr }, { data: users }] = await Promise.all([
      db().from("teams").select("*").order("created_at", { ascending: false }),
      db().from("players").select("*"),
      db().from("users").select("id, name, email"),
    ]);

    if (tErr) {
      console.error("Teams query error:", tErr);
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }

    const userMap = new Map((users ?? []).map((u: any) => [u.id, u]));
    const playersByTeam = new Map<string, any[]>();

    for (const p of players ?? []) {
      if (p.team_id) {
        if (!playersByTeam.has(p.team_id)) {
          playersByTeam.set(p.team_id, []);
        }
        playersByTeam.get(p.team_id)!.push(p);
      }
    }

    // ──────────────────────────────────────────────
    // SHEET 1: Teams Summary
    // ──────────────────────────────────────────────
    const teamsRows = (teams ?? []).map((t: any, i: number) => {
      const captain = t.captain_id ? userMap.get(t.captain_id) : null;
      const teamPlayers = playersByTeam.get(t.id) ?? [];

      let createdStr = "—";
      try {
        if (t.created_at) {
          createdStr = new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
        }
      } catch {
        createdStr = String(t.created_at ?? "—");
      }

      return {
        "#": i + 1,
        "Team Name": t.team_name ?? "—",
        Status: String(t.status ?? "pending").toUpperCase(),
        "Captain Name": captain?.name ?? t.captain_name ?? "—",
        "Captain Email": captain?.email ?? t.email ?? "—",
        "Contact Phone": t.phone ?? "—",
        Discord: t.discord ?? "—",
        WhatsApp: t.whatsapp ?? "—",
        "Total Members": teamPlayers.length,
        Points: Number(t.points) || 0,
        Wins: Number(t.wins) || 0,
        Losses: Number(t.losses) || 0,
        Draws: Number(t.draws) || 0,
        "Score / Maps Won": Number(t.maps_won) || 0,
        "Opp Score / Maps Lost": Number(t.maps_lost) || 0,
        "Registered On": createdStr,
      };
    });

    // ──────────────────────────────────────────────
    // SHEET 2: All Players (flat list)
    // ──────────────────────────────────────────────
    const playerRows: Record<string, string | number>[] = [];
    let playerIndex = 1;

    for (const t of teams ?? []) {
      const teamPlayers = playersByTeam.get(t.id) ?? [];
      for (const p of teamPlayers) {
        playerRows.push({
          "#": playerIndex++,
          "Team Name": t.team_name ?? "—",
          "Team Status": String(t.status ?? "pending").toUpperCase(),
          "Player / Member Name": p.player_name ?? "—",
          "In-Game ID (IGN)": p.game_id ?? "—",
          "Player Email": p.email ?? "—",
          "Player Phone": p.phone ?? "—",
          "IM Number": p.im_number ?? "—",
          Role: p.is_substitute ? "Substitute" : "Main Roster",
        });
      }
    }

    // ──────────────────────────────────────────────
    // SHEET 3: Team-by-Team Rosters
    // ──────────────────────────────────────────────
    const rosterRows: Record<string, string>[] = [];
    for (const t of teams ?? []) {
      const captain = t.captain_id ? userMap.get(t.captain_id) : null;
      const teamPlayers = playersByTeam.get(t.id) ?? [];

      rosterRows.push({
        Team: `TEAM: ${String(t.team_name).toUpperCase()}`,
        Status: `[ ${String(t.status).toUpperCase()} ]`,
        "Captain / Contact": captain?.name ? `${captain.name} (${captain.email})` : (t.email || "—"),
        Phone: t.phone || "—",
        "Member Name": "",
        "In-Game ID": "",
        "Member Email": "",
        "Member Phone": "",
        Role: "",
      });

      if (teamPlayers.length === 0) {
        rosterRows.push({
          Team: "",
          Status: "",
          "Captain / Contact": "",
          Phone: "",
          "Member Name": "No players registered yet",
          "In-Game ID": "",
          "Member Email": "",
          "Member Phone": "",
          Role: "",
        });
      } else {
        teamPlayers.forEach((p, pIdx) => {
          rosterRows.push({
            Team: "",
            Status: "",
            "Captain / Contact": "",
            Phone: "",
            "Member Name": `${pIdx + 1}. ${p.player_name}`,
            "In-Game ID": p.game_id || "—",
            "Member Email": p.email || "—",
            "Member Phone": p.phone || "—",
            Role: p.is_substitute ? "Substitute" : "Main Roster",
          });
        });
      }

      rosterRows.push({
        Team: "",
        Status: "",
        "Captain / Contact": "",
        Phone: "",
        "Member Name": "",
        "In-Game ID": "",
        "Member Email": "",
        "Member Phone": "",
        Role: "",
      });
    }

    // ──────────────────────────────────────────────
    // Build Workbook
    // ──────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    const wsTeams = XLSX.utils.json_to_sheet(
      teamsRows.length ? teamsRows : [{ "#": 1, "Team Name": "No teams registered yet" }]
    );
    wsTeams["!cols"] = [
      { wch: 4 },  // #
      { wch: 28 }, // Team Name
      { wch: 12 }, // Status
      { wch: 24 }, // Captain Name
      { wch: 32 }, // Captain Email
      { wch: 16 }, // Phone
      { wch: 18 }, // Discord
      { wch: 16 }, // WhatsApp
      { wch: 14 }, // Total Members
      { wch: 8 },  // Points
      { wch: 6 },  // Wins
      { wch: 8 },  // Losses
      { wch: 6 },  // Draws
      { wch: 20 }, // Score / Maps Won
      { wch: 22 }, // Opp Score / Maps Lost
      { wch: 24 }, // Registered On
    ];
    XLSX.utils.book_append_sheet(wb, wsTeams, "Teams Summary");

    const wsPlayers = XLSX.utils.json_to_sheet(
      playerRows.length ? playerRows : [{ "#": 1, "Team Name": "No players registered yet" }]
    );
    wsPlayers["!cols"] = [
      { wch: 4 },  // #
      { wch: 28 }, // Team Name
      { wch: 14 }, // Team Status
      { wch: 28 }, // Player Name
      { wch: 24 }, // In-Game ID
      { wch: 30 }, // Player Email
      { wch: 18 }, // Player Phone
      { wch: 16 }, // IM Number
      { wch: 16 }, // Role
    ];
    XLSX.utils.book_append_sheet(wb, wsPlayers, "All Players");

    const wsRosters = XLSX.utils.json_to_sheet(rosterRows);
    wsRosters["!cols"] = [
      { wch: 32 }, { wch: 16 }, { wch: 36 }, { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 30 }, { wch: 18 }, { wch: 16 }
    ];
    XLSX.utils.book_append_sheet(wb, wsRosters, "Team Rosters");

    // Output binary buffer as Uint8Array (compatible with all Response environments)
    const arrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const uint8 = new Uint8Array(arrayBuffer);

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const filename = `CODFEST_Registrations_${dateStr}.xlsx`;

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

