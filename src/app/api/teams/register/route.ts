import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase";
import { requireRole } from "@/lib/auth";
import { uploadImage } from "@/lib/cloudinary";
import { logAudit } from "@/lib/audit";
import { emitToAdmins } from "@/lib/socket";
import { sendWelcomeEmail } from "@/lib/email";

const playerSchema = z.object({
  player_name: z.string().min(1).max(50),
  email: z.string().email().optional().default(""),
  phone: z.string().max(20).optional().default(""),
  game_id: z.string().max(50).optional().default(""),
  is_substitute: z.boolean().default(false),
});

const schema = z.object({
  team_name: z.string().min(2).max(30),
  phone: z.string().min(6).max(20),
  email: z.string().email(),
  captain_name: z.string().min(2).max(60).optional(),
  game_id: z.string().max(50).optional().default(""),
  discord: z.string().max(60).optional().default(""),
  whatsapp: z.string().max(20).optional().default(""),
  players: z.array(playerSchema).min(1).max(5),
  agreed: z.literal(true),
});

/** Captain registers their team (multipart: JSON payload + optional logo file). */
export async function POST(req: Request) {
  const user = await requireRole("team_captain", "admin");
  if (!user) return NextResponse.json({ error: "Sign in as a team captain first" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("payload")));
  } catch {
    return NextResponse.json({ error: "Missing or invalid payload field" }, { status: 400 });
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.flatten() }, { status: 400 });
  }

  const { data: existingTeam } = await db()
    .from("teams").select("id").eq("captain_id", user.id).maybeSingle();
  if (existingTeam) {
    return NextResponse.json({ error: "You already registered a team" }, { status: 409 });
  }

  let logoUrl: string | null = null;
  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo must be under 4 MB" }, { status: 400 });
    }
    logoUrl = await uploadImage(Buffer.from(await logo.arrayBuffer()), "codfest/logos");
  }

  const d = parsed.data;
  if (d.captain_name) {
    await db().from("users").update({ name: d.captain_name.trim() }).eq("id", user.id);
  }

  const { data: team, error } = await db()
    .from("teams")
    .insert({
      team_name: d.team_name.trim(),
      logo_url: logoUrl,
      phone: d.phone,
      email: d.email,
      discord: d.discord,
      whatsapp: d.whatsapp,
      captain_id: user.id,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    const msg = error.code === "23505" ? "Team name already taken" : error.message;
    return NextResponse.json({ error: msg }, { status: 409 });
  }

  // Save leader's game_id in system settings so it doesn't break supabase schema
  if (d.game_id?.trim()) {
    const { getSystemSettings, updateSystemSettings } = await import("@/lib/standings");
    const settings = await getSystemSettings();
    const leaderGameIds = { ...(settings.leader_game_ids ?? {}) };
    leaderGameIds[team.id] = d.game_id.trim();
    await updateSystemSettings({ leader_game_ids: leaderGameIds });
  }

  const { error: playersError } = await db().from("players").insert(
    d.players.map((p) => ({ ...p, team_id: team.id }))
  );
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });

  await logAudit(user.id, "team.registered", team.id, { team_name: team.team_name });
  emitToAdmins("team:registered", { teamId: team.id, teamName: team.team_name });

  // Dispatch Welcome email to captain asynchronously
  sendWelcomeEmail({
    to: d.email,
    name: user.name,
    teamName: team.team_name,
    regId: team.id,
  }).catch((err) => console.error("[sendWelcomeEmail captain] error:", err));

  // Dispatch Welcome email to squad members with email addresses
  for (const player of d.players) {
    if (player.email && player.email.toLowerCase().trim() !== d.email.toLowerCase().trim()) {
      sendWelcomeEmail({
        to: player.email,
        name: player.player_name,
        teamName: team.team_name,
        regId: team.id,
      }).catch((err) => console.error(`[sendWelcomeEmail player ${player.email}] error:`, err));
    }
  }

  return NextResponse.json({ team }, { status: 201 });
}

