import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { emitToAdmins, emitEvent } from "@/lib/socket";
import { getSystemSettings, updateSystemSettings, getLeaderboard } from "@/lib/standings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Admin — all teams in every status, with rosters and leader game IDs. */
export async function GET() {
  const admin = await requireRole("admin");
  if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const [{ data: teams }, settings] = await Promise.all([
    db()
      .from("teams")
      .select("*, captain:users!teams_captain_id_fkey(name, email), players(*)")
      .order("created_at", { ascending: false }),
    getSystemSettings(),
  ]);

  const leaderGameIds = settings.leader_game_ids ?? {};
  const leaderImNumbers = settings.leader_im_numbers ?? {};
  const teamCategories = settings.team_categories ?? {};

  const enriched = (teams ?? []).map((t: any) => ({
    ...t,
    game_id: leaderGameIds[t.id] ?? "",
    im_number: leaderImNumbers[t.id] ?? "",
    category: teamCategories[t.id] ?? "boys",
  }));

  return NextResponse.json({ teams: enriched });
}

const manualPlayerSchema = z.object({
  id: z.string().optional(),
  player_name: z.string().min(1).max(50),
  game_id: z.string().max(50).optional().default(""),
  email: z.string().optional().default(""),
  phone: z.string().max(30).optional().default(""),
  im_number: z.string().max(50).optional().default(""),
  is_substitute: z.boolean().default(false),
});

const manualTeamSchema = z.object({
  team_name: z.string().min(2).max(50),
  captain_name: z.string().min(2).max(60),
  email: z.string().optional().default(""),
  phone: z.string().max(30).optional().default(""),
  game_id: z.string().max(50).optional().default(""),
  im_number: z.string().max(50).optional().default(""),
  category: z.enum(["boys", "girls"]).default("boys"),
  status: z.enum(["approved", "pending", "rejected"]).default("approved"),
  points: z.number().int().default(0),
  wins: z.number().int().default(0),
  losses: z.number().int().default(0),
  draws: z.number().int().default(0),
  discord: z.string().max(60).optional().default(""),
  whatsapp: z.string().max(30).optional().default(""),
  players: z.array(manualPlayerSchema).optional().default([]),
});

const updateTeamSchema = manualTeamSchema.extend({
  team_id: z.string().min(1),
});

/** Admin — manually create a squad with full roster and stats. */
export async function POST(req: Request) {
  try {
    const admin = await requireRole("admin");
    if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = manualTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;
    const teamSlug = d.team_name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const rawEmail = d.email?.trim().toLowerCase() ?? "";
    const isValidEmail = Boolean(rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail));
    const captainEmail = isValidEmail
      ? rawEmail
      : `leader_${teamSlug || "squad"}_${Date.now().toString().slice(-4)}@codfest.gg`;

    // 1. Find or create captain user
    let { data: captain } = await db()
      .from("users")
      .select("id, name, email")
      .eq("email", captainEmail)
      .maybeSingle();

    if (!captain) {
      const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
      const { data: newUser, error: uErr } = await db()
        .from("users")
        .insert({
          name: d.captain_name.trim(),
          email: captainEmail,
          password_hash: passwordHash,
          role: "team_captain",
          email_verified: true,
        })
        .select("id, name, email")
        .single();

      if (uErr) {
        return NextResponse.json({ error: `Failed to create captain user: ${uErr.message}` }, { status: 500 });
      }
      captain = newUser;
    } else {
      await db().from("users").update({ name: d.captain_name.trim() }).eq("id", captain.id);
    }

    // 2. Insert team
    const { data: team, error: tErr } = await db()
      .from("teams")
      .insert({
        team_name: d.team_name.trim(),
        phone: d.phone,
        email: captainEmail,
        discord: d.discord,
        whatsapp: d.whatsapp,
        captain_id: captain.id,
        status: d.status,
        points: d.points,
        wins: d.wins,
        losses: d.losses,
        draws: d.draws,
      })
      .select("*")
      .single();

    if (tErr) {
      const msg = tErr.code === "23505" ? "Team name already taken" : tErr.message;
      return NextResponse.json({ error: msg }, { status: 409 });
    }

    // 3. Insert players
    if (d.players && d.players.length > 0) {
      const { error: pErr } = await db().from("players").insert(
        d.players.map((p) => ({
          team_id: team.id,
          player_name: p.player_name.trim(),
          email: p.email || "",
          phone: p.phone || "",
          im_number: p.im_number || "",
          game_id: p.game_id || "",
          is_substitute: p.is_substitute,
        }))
      );
      if (pErr) console.error("[manual team players insert error]", pErr);
    }

    // 4. Save metadata in system settings
    const settings = await getSystemSettings();
    const leaderGameIds = { ...(settings.leader_game_ids ?? {}) };
    const leaderImNumbers = { ...(settings.leader_im_numbers ?? {}) };
    const teamCategories = { ...(settings.team_categories ?? {}) };

    if (d.game_id?.trim()) leaderGameIds[team.id] = d.game_id.trim();
    if (d.im_number?.trim()) leaderImNumbers[team.id] = d.im_number.trim();
    teamCategories[team.id] = d.category;

    await updateSystemSettings({
      leader_game_ids: leaderGameIds,
      leader_im_numbers: leaderImNumbers,
      team_categories: teamCategories,
    });

    // 5. Emit socket events & audit log
    const leaderboard = await getLeaderboard();
    emitEvent("leaderboard:updated", { leaderboard });
    emitToAdmins("team:registered", { teamId: team.id, teamName: team.team_name });
    await logAudit(admin.id, "team.created_manually", team.id, {
      team_name: team.team_name,
      category: d.category,
      players_count: d.players.length,
    });

    return NextResponse.json({ ok: true, team }, { status: 201 });
  } catch (err: any) {
    console.error("[POST /api/admin/teams error]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

/** Admin — edit any registered team, captain details, and full player roster. */
export async function PATCH(req: Request) {
  try {
    const admin = await requireRole("admin");
    if (!admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const parsed = updateTeamSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
    }

    const d = parsed.data;

    // 1. Fetch team
    const { data: team, error: lookupErr } = await db()
      .from("teams")
      .select("id, captain_id")
      .eq("id", d.team_id)
      .single();

    if (lookupErr || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // 2. Update leader name and email on users table if captain exists
    if (team.captain_id) {
      const userUpdates: Record<string, any> = { name: d.captain_name.trim() };
      const rawEmail = d.email?.trim().toLowerCase() ?? "";
      if (rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        userUpdates.email = rawEmail;
      }
      await db().from("users").update(userUpdates).eq("id", team.captain_id);
    }

    // 3. Update team fields
    const teamUpdates: Record<string, any> = {
      team_name: d.team_name.trim(),
      phone: d.phone ?? "",
      status: d.status,
      points: d.points,
      wins: d.wins,
      losses: d.losses,
      draws: d.draws,
      discord: d.discord ?? "",
      whatsapp: d.whatsapp ?? "",
    };
    if (d.email?.trim()) {
      teamUpdates.email = d.email.trim();
    }
    const { error: teamErr } = await db().from("teams").update(teamUpdates).eq("id", d.team_id);
    if (teamErr) {
      return NextResponse.json({ error: teamErr.message }, { status: 500 });
    }

    // 4. Update players roster: delete old players and insert new ones
    if (d.players) {
      await db().from("players").delete().eq("team_id", d.team_id);
      if (d.players.length > 0) {
        await db().from("players").insert(
          d.players.map((p) => ({
            team_id: d.team_id,
            player_name: p.player_name.trim(),
            email: p.email || "",
            phone: p.phone || "",
            im_number: p.im_number || "",
            game_id: p.game_id || "",
            is_substitute: p.is_substitute,
          }))
        );
      }
    }

    // 5. Update settings metadata (leader game ID, IM, division category)
    const settings = await getSystemSettings();
    const leaderGameIds = { ...(settings.leader_game_ids ?? {}) };
    const leaderImNumbers = { ...(settings.leader_im_numbers ?? {}) };
    const teamCategories = { ...(settings.team_categories ?? {}) };

    leaderGameIds[d.team_id] = d.game_id ? d.game_id.trim() : "";
    leaderImNumbers[d.team_id] = d.im_number ? d.im_number.trim() : "";
    teamCategories[d.team_id] = d.category;

    await updateSystemSettings({
      leader_game_ids: leaderGameIds,
      leader_im_numbers: leaderImNumbers,
      team_categories: teamCategories,
    });

    // 6. Refresh leaderboard and emit
    const leaderboard = await getLeaderboard();
    emitEvent("leaderboard:updated", { leaderboard });
    await logAudit(admin.id, "team.updated_by_admin", d.team_id, {
      team_name: d.team_name,
      category: d.category,
      players_count: d.players.length,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[PATCH /api/admin/teams error]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
