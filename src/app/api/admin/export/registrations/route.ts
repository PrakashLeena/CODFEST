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

    // 1. Fetch teams with relations (with safe fallback if join fails)
    let teamsData: any[] = [];
    
    const { data: teamsWithRel, error: relErr } = await db()
      .from("teams")
      .select("*, captain:users!teams_captain_id_fkey(name, email), players(*)")
      .order("created_at", { ascending: false });

    if (relErr || !teamsWithRel) {
      console.warn("Teams relation query warning, falling back to separate queries:", relErr?.message);
      // Fallback: query teams and players separately
      const [{ data: rawTeams }, { data: rawPlayers }] = await Promise.all([
        db().from("teams").select("*").order("created_at", { ascending: false }),
        db().from("players").select("*"),
      ]);

      const playersByTeam: Record<string, any[]> = {};
      for (const p of rawPlayers ?? []) {
        if (p.team_id) {
          if (!playersByTeam[p.team_id]) playersByTeam[p.team_id] = [];
          playersByTeam[p.team_id].push(p);
        }
      }

      teamsData = (rawTeams ?? []).map((t: any) => ({
        ...t,
        players: playersByTeam[t.id] ?? [],
      }));
    } else {
      teamsData = teamsWithRel;
    }

    // ──────────────────────────────────────────────
    // SHEET 1: Teams Summary
    // ──────────────────────────────────────────────
    const teamsRows = teamsData.map((t: any, i: number) => {
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
        "Captain Name": t.captain?.name ?? "—",
        "Captain Email": t.captain?.email ?? t.email ?? "—",
        Phone: t.phone ?? "—",
        Discord: t.discord ?? "—",
        WhatsApp: t.whatsapp ?? "—",
        "Players Count": Array.isArray(t.players) ? t.players.length : 0,
        Points: Number(t.points) || 0,
        Wins: Number(t.wins) || 0,
        Losses: Number(t.losses) || 0,
        Draws: Number(t.draws) || 0,
        "Maps Won": Number(t.maps_won) || 0,
        "Maps Lost": Number(t.maps_lost) || 0,
        "Registered At": createdStr,
      };
    });

    // ──────────────────────────────────────────────
    // SHEET 2: All Players (flat list)
    // ──────────────────────────────────────────────
    const playerRows: Record<string, string | number>[] = [];
    let playerIndex = 1;

    for (const t of teamsData) {
      const pList = Array.isArray(t.players) ? t.players : [];
      for (const p of pList) {
        let joinedStr = "—";
        try {
          if (p.created_at) {
            joinedStr = new Date(p.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
          }
        } catch {
          joinedStr = String(p.created_at ?? "—");
        }

        playerRows.push({
          "#": playerIndex++,
          "Team Name": t.team_name ?? "—",
          "Team Status": String(t.status ?? "pending").toUpperCase(),
          "Player Name": p.player_name ?? "—",
          "In-Game ID / IGN": p.game_id ?? "—",
          Role: p.is_substitute ? "Substitute" : "Main Roster",
          "Joined At": joinedStr,
        });
      }
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
      { wch: 26 }, // Team Name
      { wch: 12 }, // Status
      { wch: 22 }, // Captain Name
      { wch: 28 }, // Captain Email
      { wch: 15 }, // Phone
      { wch: 18 }, // Discord
      { wch: 16 }, // WhatsApp
      { wch: 14 }, // Players Count
      { wch: 8 },  // Points
      { wch: 6 },  // Wins
      { wch: 8 },  // Losses
      { wch: 6 },  // Draws
      { wch: 10 }, // Maps Won
      { wch: 10 }, // Maps Lost
      { wch: 22 }, // Registered At
    ];
    XLSX.utils.book_append_sheet(wb, wsTeams, "Teams");

    const wsPlayers = XLSX.utils.json_to_sheet(
      playerRows.length ? playerRows : [{ "#": 1, "Team Name": "No players registered yet" }]
    );
    wsPlayers["!cols"] = [
      { wch: 4 },  // #
      { wch: 26 }, // Team Name
      { wch: 14 }, // Team Status
      { wch: 26 }, // Player Name
      { wch: 22 }, // In-Game ID
      { wch: 14 }, // Role
      { wch: 22 }, // Joined At
    ];
    XLSX.utils.book_append_sheet(wb, wsPlayers, "Players");

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

