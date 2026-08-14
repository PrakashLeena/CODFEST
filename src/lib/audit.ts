import { db } from "@/lib/supabase";

function isUuid(str: string | null | undefined): boolean {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

/** Append-only audit trail. Every score submission, resolution and admin action lands here. */
export async function logAudit(
  actorId: string | null,
  action: string,
  targetId: string | null,
  details: Record<string, unknown> = {}
) {
  try {
    const validActorId = isUuid(actorId) ? actorId : null;
    const validTargetId = isUuid(targetId) ? targetId : null;
    const enrichedDetails = {
      ...details,
      ...(actorId && !validActorId ? { actor_uid: actorId } : {}),
      ...(targetId && !validTargetId ? { target_raw: targetId } : {}),
    };

    await db().from("audit_logs").insert({
      actor_id: validActorId,
      action,
      target_id: validTargetId,
      details: enrichedDetails,
    });
  } catch (e) {
    console.error("[logAudit] failed to write audit log:", e);
  }
}

