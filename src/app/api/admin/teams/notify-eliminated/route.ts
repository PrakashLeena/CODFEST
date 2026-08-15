import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { sendEliminationEmail } from "@/lib/email";
import { emitEvent } from "@/lib/socket";
import { getSystemSettings } from "@/lib/standings";

export const dynamic = "force-dynamic";

const notifySchema = z.object({
  team_id: z.string().uuid().optional().nullable(),
  team_ids: z.array(z.string().uuid()).optional().default([]),
  all_eliminated: z.boolean().optional().default(false),
  division: z.enum(["all", "boys", "girls"]).optional().default("all"),
  custom_message: z.string().max(2000).optional().nullable(),
  stage: z.string().max(100).optional().default("Tournament Knockout Stage"),
  create_announcement: z.boolean().optional().default(false),
  announcement_title: z.string().max(120).optional().nullable(),
});

export async function POST(req: Request) {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const raw = await req.json().catch(() => null);
  const parsed = notifySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const {
    team_id,
    team_ids,
    all_eliminated,
    division,
    custom_message,
    stage,
    create_announcement,
    announcement_title,
  } = parsed.data;

  const [{ data: allTeams }, settings] = await Promise.all([
    db()
      .from("teams")
      .select("id, team_name, email, wins, losses, draws, maps_won, maps_lost, status, captain_id, captain:users!teams_captain_id_fkey(name, email), players(id, player_name, email)")
      .eq("status", "approved"),
    getSystemSettings(),
  ]);

  const teamCategories: Record<string, "boys" | "girls"> = settings.team_categories ?? {};

  // Filter candidates
  let targetTeams: any[] = [];

  if (team_id) {
    targetTeams = (allTeams ?? []).filter((t) => t.id === team_id);
  } else if (team_ids.length > 0) {
    targetTeams = (allTeams ?? []).filter((t) => team_ids.includes(t.id));
  } else if (all_eliminated) {
    // Teams that have lost at least 1 match or have losses > 0
    targetTeams = (allTeams ?? []).filter((t) => {
      const cat = teamCategories[t.id] ?? "boys";
      const matchesDivision = division === "all" || cat === division;
      const isEliminated = (t.losses || 0) > 0;
      return matchesDivision && isEliminated;
    });
  }

  if (targetTeams.length === 0) {
    return NextResponse.json({ error: "No matching eliminated teams found to notify." }, { status: 404 });
  }

  const results: { team_id: string; team_name: string; email: string; success: boolean; error?: string | null }[] = [];

  for (const t of targetTeams) {
    const captainEmail = t.captain?.email || t.email;
    const captainName = t.captain?.name || "Team Captain";

    if (!captainEmail) {
      results.push({
        team_id: t.id,
        team_name: t.team_name,
        email: "none",
        success: false,
        error: "No email address found for team captain",
      });
      continue;
    }

    const err = await sendEliminationEmail({
      to: captainEmail,
      name: captainName,
      teamName: t.team_name,
      customMessage: custom_message,
      wins: t.wins ?? 0,
      losses: t.losses ?? 0,
      draws: t.draws ?? 0,
      stage,
    });

    results.push({
      team_id: t.id,
      team_name: t.team_name,
      email: captainEmail,
      success: !err,
      error: err,
    });
  }

  // Optionally create a general announcement
  if (create_announcement && results.some((r) => r.success)) {
    const title = announcement_title || `Tournament Update: Respect to our Eliminated Teams`;
    const notifiedNames = targetTeams.map((t) => t.team_name).join(", ");
    const body = custom_message
      ? `${custom_message}\n\nHonoring squads: ${notifiedNames}.`
      : `Huge respect and appreciation to our participating teams (${notifiedNames}) for their incredible fighting spirit in CODFEST! Thank you for being a part of this competition.`;

    const { data: announcement } = await db()
      .from("announcements")
      .insert({ title, body })
      .select("*")
      .single();

    if (announcement) {
      emitEvent("announcement:new", { announcement });
    }
  }

  // Realtime notification event for client tabs
  emitEvent("team:eliminated_notified", {
    notified_count: results.filter((r) => r.success).length,
    teams: targetTeams.map((t) => ({ id: t.id, name: t.team_name })),
  });

  await logAudit(admin.id, "team.eliminated_notified", team_id ?? "bulk", {
    count: results.length,
    successful: results.filter((r) => r.success).length,
    teams: results.map((r) => r.team_name),
    stage,
  });

  return NextResponse.json({
    ok: true,
    total_targeted: targetTeams.length,
    successful_count: results.filter((r) => r.success).length,
    results,
  });
}
