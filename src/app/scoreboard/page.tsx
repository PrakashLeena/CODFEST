"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Redirect to the Leaderboard & Match Clash scoreboard page. */
export default function ScoreboardRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/leaderboard");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0c10]">
      <p className="font-mono text-xs text-gray-500 animate-pulse">
        Redirecting to Leaderboard & Match Scoreboard…
      </p>
    </main>
  );
}
