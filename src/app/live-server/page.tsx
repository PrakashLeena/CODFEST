"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * The live server view has been moved into the Admin Panel
 * (Live Server tab). Redirect there automatically.
 */
export default function LiveServerRedirect() {
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
