"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Killfeed/scoreboard has been moved into the Admin Panel → Live Server tab. */
export default function ScoreboardRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/admin"); }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0c10]">
      <p className="font-mono text-xs text-gray-500 animate-pulse">
        Redirecting to Admin Panel…
      </p>
    </main>
  );
}
