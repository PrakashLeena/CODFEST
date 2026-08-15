"use client";

import { useState } from "react";

const FAQS: [string, string][] = [
  ["How do I register my team?", "The team captain verifies email with an OTP on the Register page (no password setup), then fills in the team form (name, logo, contacts, up to 5 players + optional substitute). Your team goes live after admin approval."],
  ["Why do both captains have to submit the score?", "Matches run on your own PCs, so there's no server we can read results from. Both captains report the score with a screenshot; if the reports match, the result confirms automatically. If not, admins review the screenshots."],
  ["What screenshot do I need?", "The final scoreboard at the end of the last round, showing both team scores clearly. Take it before anyone leaves the server."],
  ["What happens if the other captain never submits?", "The match stays in 'Awaiting scores'. After the deadline in the rules, admins can resolve it manually using the available evidence — usually in favour of the team that submitted proof."],
  ["Can I change my roster after registering?", "Yes, captains can edit their roster from the team dashboard until the bracket is generated. After that, roster changes need admin approval via Discord."],
  ["Which maps are played?", "Crash, Backlot, Strike, Crossfire, District and Killhouse. The map for each fixture is shown on the match card."],
  ["Is there an entry fee?", "No — CODFEST is free to enter. Check the home page for the current prize pool."],
  ["Where are matches streamed?", "Featured matches carry a 'Watch stream' link on their match card when live."],
];

export default function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="site-gutter mx-auto max-w-7xl py-10">
      <h1 className="section-title">Frequently Asked Questions</h1>
      <div className="mt-6 space-y-3">
        {FAQS.map(([q, a], i) => (
          <div key={i} className="card overflow-hidden">
            <button
              className="flex w-full items-center justify-between px-5 py-4 text-left font-semibold text-zinc-200 hover:text-white"
              onClick={() => setOpen(open === i ? null : i)}
            >
              {q}
              <span className="text-ember-500">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <p className="border-t border-night-800 px-5 py-4 text-sm leading-relaxed text-zinc-400">{a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
