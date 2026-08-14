import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/export/registrations
 * Downloads all team registration details as an Excel (.xlsx) file.
 * Sheet 1: Teams summary | Sheet 2: All Players (flat)
 */
export async function GET() {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const { data: teams, error } = await db()
    .from("teams")
    .select(
      "id, team_name, logo_url, status, phone, discord, points, wins, losses, draws, maps_won, maps_lost, created_at, captain:users!teams_captain_id_fkey(name, email), players(id, player_name, game_id, created_at)"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // ──────────────────────────────────────────────
  // SHEET 1: Teams Summary
  // ──────────────────────────────────────────────
  const teamsRows = (teams ?? []).map((t: any, i: number) => ({
    "#": i + 1,
    "Team Name": t.team_name,
    Status: t.status,
    "Captain Name": t.captain?.name ?? "—",
    "Captain Email": t.captain?.email ?? "—",
    Phone: t.phone ?? "—",
    Discord: t.discord ?? "—",
    "Players Count": t.players?.length ?? 0,
    Points: t.points ?? 0,
    Wins: t.wins ?? 0,
    Losses: t.losses ?? 0,
    Draws: t.draws ?? 0,
    "Maps Won": t.maps_won ?? 0,
    "Maps Lost": t.maps_lost ?? 0,
    "Registered At": t.created_at
      ? new Date(t.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
      : "—",
  }));

  // ──────────────────────────────────────────────
  // SHEET 2: All Players (flat)
  // ──────────────────────────────────────────────
  const playerRows: Record<string, string | number>[] = [];
  let playerIndex = 1;
  for (const t of teams ?? []) {
    for (const p of (t as any).players ?? []) {
      playerRows.push({
        "#": playerIndex++,
        "Team Name": (t as any).team_name,
        "Team Status": (t as any).status,
        "Player Name": p.player_name,
        "In-Game ID": p.game_id ?? "—",
        "Joined At": p.created_at
          ? new Date(p.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
          : "—",
      });
    }
  }

  // ──────────────────────────────────────────────
  // Build Workbook
  // ──────────────────────────────────────────────
  const wb = XLSX.utils.book_new();

  const wsTeams = XLSX.utils.json_to_sheet(
    teamsRows.length ? teamsRows : [{ "#": "", "Team Name": "No teams registered yet" }]
  );
  wsTeams["!cols"] = [
    { wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 24 }, { wch: 30 },
    { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 6 },
    { wch: 8 }, { wch: 6 }, { wch: 10 }, { wch: 10 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsTeams, "Teams");

  const wsPlayers = XLSX.utils.json_to_sheet(
    playerRows.length ? playerRows : [{ "#": "", "Team Name": "No players registered yet" }]
  );
  wsPlayers["!cols"] = [
    { wch: 4 }, { wch: 28 }, { wch: 10 }, { wch: 28 }, { wch: 24 }, { wch: 24 },
  ];
  XLSX.utils.book_append_sheet(wb, wsPlayers, "Players");

  // Write to buffer
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const dateStr = new Date()
    .toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })
    .replace(/\//g, "-");
  const filename = `CODFEST_Registrations_${dateStr}.xlsx`;

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
