import { db } from "@/lib/supabase";
import Hero from "@/components/Hero";
import AnimatedHomeContent from "@/components/AnimatedHomeContent";
import { MAP_POOL } from "@/lib/types";

// Revalidate every 30 seconds — stats & announcements don't need real-time precision.
export const revalidate = 30;

export default async function HomePage() {
  const supa = db();
  const [teams, players, played, live, nextMatch, announcements] = await Promise.all([
    supa.from("teams").select("id", { count: "exact", head: true }).eq("status", "approved"),
    supa.from("players").select("id", { count: "exact", head: true }),
    supa.from("matches").select("id", { count: "exact", head: true }).eq("status", "finished"),
    supa.from("matches").select("id", { count: "exact", head: true }).eq("status", "live"),
    supa
      .from("matches")
      .select("scheduled_time")
      .eq("status", "scheduled")
      .not("scheduled_time", "is", null)
      .gt("scheduled_time", new Date().toISOString())
      .order("scheduled_time")
      .limit(1)
      .maybeSingle(),
    supa.from("announcements").select("*").neq("title", "__SYSTEM_SETTINGS__").order("created_at", { ascending: false }).limit(3),
  ]);

  return (
    <>
      <Hero
        liveCount={live.count ?? 0}
        nextMatchTime={nextMatch.data?.scheduled_time ?? null}
        registrationOpen={process.env.NEXT_PUBLIC_REGISTRATION_OPEN !== "false"}
        prizePool={process.env.NEXT_PUBLIC_PRIZE_POOL ?? "TBA"}
        stats={{ teams: teams.count ?? 0, players: players.count ?? 0, played: played.count ?? 0 }}
      />

      <AnimatedHomeContent
        mapPool={MAP_POOL}
        announcements={announcements.data ?? []}
      />
    </>
  );
}
